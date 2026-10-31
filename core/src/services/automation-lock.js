'use strict';

/**
 * 自动任务全局互斥锁。
 *
 * 背景：定时巡检（农场/好友/每日例行/活动领取）与后台"立即执行"按钮可能同时
 * 操作同一个账号，导致重复收获、重复领取、协议状态互相踩踏。
 *
 * 设计要点：
 * 1. 以账号为粒度串行（同一账号同一时刻只允许一个自动任务在跑）；
 * 2. 可重入：任务内部再次调用不会被自己卡死（AsyncLocalStorage 记录持有栈）；
 * 3. 等锁超时抛 AutomationBusyError（errorType=automation_busy），调用方按"本轮跳过"处理；
 * 4. 单任务超时只记日志并释放锁，避免一次卡死把账号永久锁住；
 * 5. 心跳 / ACE / 只读查询不进这把锁（由调用方决定），避免影响实时性。
 */

const { AsyncLocalStorage } = require('async_hooks');

const DEFAULT_LOCK_TIMEOUT_MS = 120000;
const DEFAULT_TASK_TIMEOUT_MS = 180000;
const MAX_WAITING = 20;

class AutomationBusyError extends Error {
    constructor(message) {
        super(message || '上一轮自动任务尚未结束，本轮跳过');
        this.name = 'AutomationBusyError';
        this.errorType = 'automation_busy';
        this.code = 'AUTOMATION_BUSY';
    }
}

const heldStore = new AsyncLocalStorage();
const locks = new Map();

function resolveKey(options) {
    const explicit = options && (options.key || options.accountId);
    if (explicit) return String(explicit);
    return String(process.env.FARM_ACCOUNT_ID || 'default');
}

function getLock(key) {
    let lock = locks.get(key);
    if (!lock) {
        lock = { key, locked: false, waiters: [], current: null, lastHolder: null, totalRuns: 0, totalTimeouts: 0 };
        locks.set(key, lock);
    }
    return lock;
}

function takeTurn(lock, timeoutMs, name) {
    if (!lock.locked) {
        lock.locked = true;
        lock.current = name;
        return Promise.resolve();
    }
    if (lock.waiters.length >= MAX_WAITING) {
        return Promise.reject(new AutomationBusyError(`自动任务排队过多（${lock.waiters.length}），本轮跳过`));
    }
    return new Promise((resolve, reject) => {
        const waiter = { resolve, timer: null };
        const finish = (fn, value) => {
            if (waiter.timer) {
                clearTimeout(waiter.timer);
                waiter.timer = null;
            }
            fn(value);
        };
        waiter.resolve = () => finish(resolve);
        waiter.timer = setTimeout(() => {
            const index = lock.waiters.indexOf(waiter);
            if (index >= 0) lock.waiters.splice(index, 1);
            reject(new AutomationBusyError(`等待自动任务锁超时（${Math.round(timeoutMs / 1000)}s），本轮跳过`));
        }, Math.max(50, Number(timeoutMs) || DEFAULT_LOCK_TIMEOUT_MS));
        // 不阻止进程退出
        if (waiter.timer.unref) waiter.timer.unref();
        lock.waiters.push(waiter);
    });
}

function releaseTurn(lock) {
    const next = lock.waiters.shift();
    if (next) {
        // 直接把持有权交给下一个等待者，避免"释放瞬间被新请求插队"
        lock.current = null;
        next.resolve();
        return;
    }
    lock.locked = false;
    lock.current = null;
}

function runWithTimeout(task, timeoutMs, name) {
    const limit = Number(timeoutMs) || DEFAULT_TASK_TIMEOUT_MS;
    if (!Number.isFinite(limit) || limit <= 0) return task();
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error(`自动任务 ${name} 执行超时（${Math.round(limit / 1000)}s）`));
        }, limit);
        if (timer.unref) timer.unref();
        Promise.resolve()
            .then(task)
            .then(value => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            })
            .catch(err => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(err);
            });
    });
}

/**
 * 在全局互斥锁内执行一个自动任务。
 * @param {string} name 任务名（用于日志/诊断）
 * @param {() => Promise<any>|any} task 任务体
 * @param {{key?: string, accountId?: string, lockTimeoutMs?: number, taskTimeoutMs?: number}} [options]
 */
async function withAutomationLock(name, task, options = {}) {
    if (typeof task !== 'function') throw new TypeError('withAutomationLock 需要一个函数');
    const key = resolveKey(options);
    const label = String(name || 'automation');

    // 可重入：同一 async 调用链里已经持有该账号的锁
    const held = heldStore.getStore();
    if (held && held.has(key)) {
        const entry = held.get(key);
        entry.depth += 1;
        try {
            return await runWithTimeout(task, options.taskTimeoutMs, label);
        } finally {
            entry.depth -= 1;
        }
    }

    const lock = getLock(key);
    await takeTurn(lock, options.lockTimeoutMs, label);

    const nextHeld = new Map(held || []);
    nextHeld.set(key, { depth: 1, name: label });
    lock.totalRuns += 1;
    const startAt = Date.now();
    try {
        return await heldStore.run(nextHeld, () => runWithTimeout(task, options.taskTimeoutMs, label));
    } catch (err) {
        if (err && /执行超时/.test(String(err.message || ''))) {
            lock.totalTimeouts += 1;
            try {
                console.warn(`[automation-lock] ${label} 超时，已释放账号锁（耗时 ${Date.now() - startAt}ms）`);
            } catch { /* 忽略日志异常 */ }
        }
        throw err;
    } finally {
        releaseTurn(lock);
    }
}

/** 当前是否已有自动任务持有该账号的锁（用于调度器决定是否延后） */
function isAutomationBusy(accountId) {
    const key = String(accountId || process.env.FARM_ACCOUNT_ID || 'default');
    const lock = locks.get(key);
    return !!(lock && (lock.locked || lock.waiters.length > 0));
}

/** 诊断快照：后台可展示"当前在跑什么、排队几个" */
function getAutomationLockStats() {
    const result = [];
    for (const lock of locks.values()) {
        result.push({
            accountId: lock.key,
            locked: lock.locked,
            current: lock.current,
            waiting: lock.waiters.length,
            totalRuns: lock.totalRuns,
            totalTimeouts: lock.totalTimeouts
        });
    }
    return result;
}

/** 测试用：清空全部锁状态 */
function resetAutomationLocks() {
    locks.clear();
}

module.exports = {
    AutomationBusyError,
    withAutomationLock,
    isAutomationBusy,
    getAutomationLockStats,
    resetAutomationLocks,
    DEFAULT_LOCK_TIMEOUT_MS,
    DEFAULT_TASK_TIMEOUT_MS,
    MAX_WAITING
};
