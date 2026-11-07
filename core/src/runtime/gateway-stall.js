/**
 * 两级「假死」判定（对应上游的 degraded / dead 双阈值）
 *
 * 背景：游戏服务器会偶发静默——连接看着是好的，请求发出去石沉大海。
 * 旧逻辑一超时就重连，重连要消耗一次性 Code，等于把健康状况良好的连接亲手掐死。
 *
 * 两级策略：
 *   ① 先让路（degraded）：业务请求连续 2 次超时，就暂停所有业务请求，
 *      只留心跳，把带宽让给连接自己缓过来；恢复后自动解除，不重连、不掉号。
 *   ② 再判死（dead）：让路也不管用、连续 7 次超时，才认定连接真坏了。
 *
 * 这两个数字不是拍脑袋：按上游几天的真实回包统计，绝大多数「假死」在
 * 让路后 30~90 秒内自行恢复，连接本身没坏。所以判死必须比让路慢一个数量级，
 * 宁可多等一分钟，也别白白烧掉一个凭证。
 */
'use strict';

// 心跳 / 登录 / 安全链路：这些请求服务于「连接存活」本身，永远不算失败样本，
// 否则一次心跳抖动就会把健康连接推进退避甚至判死。
const CRITICAL_METHODS = new Set(['Heartbeat', 'Login', 'Logout', 'Reconnect', 'Kickout']);
const CRITICAL_SERVICE = /(UserService|LoginService|AceService|SecurityService)/i;

function isCritical(service, method) {
    const name = String(method || '');
    if (CRITICAL_METHODS.has(name)) return true;
    const svc = String(service || '');
    return CRITICAL_SERVICE.test(svc) && /login|heartbeat|ace|security/i.test(name);
}

function createStallMonitor(options = {}) {
    const degradedAfter = Number(options.degradedAfter) || 2;
    const deadAfter = Math.max(degradedAfter + 1, Number(options.deadAfter) || 7);
    const baseMs = Number(options.baseMs) || 30000;
    const maxMs = Math.max(baseMs, Number(options.maxMs) || 180000);

    let streak = 0;
    let degradedUntil = 0;
    let lastReason = '';
    let deadAt = 0;
    let recoveredCount = 0;

    function backoffMs() {
        // 第 1 次退避 30s，之后每次翻倍，封顶 3 分钟
        const step = Math.max(0, streak - degradedAfter);
        return Math.min(maxMs, baseMs * (2 ** step));
    }

    function isDegraded(now = Date.now()) {
        if (!degradedUntil) return false;
        if (now >= degradedUntil) {
            degradedUntil = 0;
            return false;
        }
        return true;
    }

    /** 记录一次业务请求超时；返回本次是否刚好跨过阈值 */
    function onTimeout(service, method) {
        if (isCritical(service, method)) return { counted: false };
        streak += 1;
        lastReason = `${method || 'request'} 超时`;

        let justDegraded = false;
        if (streak >= deadAfter) {
            if (!deadAt) deadAt = Date.now();
            return { counted: true, degraded: true, dead: true, streak };
        }
        deadAt = 0;
        if (streak >= degradedAfter) {
            const wasDegraded = isDegraded();
            degradedUntil = Date.now() + backoffMs();
            justDegraded = !wasDegraded;
        }
        return {
            counted: true,
            degraded: streak >= degradedAfter,
            justDegraded,
            streak,
            dead: false,
            backoffMs: backoffMs(),
        };
    }

    /** 任意一次正常回包即视为连接自愈 */
    function onSuccess(service, method) {
        if (isCritical(service, method)) return { recovered: false };
        const wasDegraded = isDegraded();
        const hadStreak = streak > 0;
        streak = 0;
        degradedUntil = 0;
        deadAt = 0;
        if (wasDegraded || hadStreak) {
            recoveredCount += 1;
            return { recovered: true, wasDegraded };
        }
        return { recovered: false };
    }

    function snapshot(now = Date.now()) {
        const degraded = isDegraded(now);
        return {
            streak,
            degraded,
            degradedRemainingMs: degraded ? Math.max(0, degradedUntil - now) : 0,
            reason: lastReason,
            dead: streak >= deadAfter,
            deadSince: deadAt || 0,
            recoveredCount,
            thresholds: { degradedAfter, deadAfter, baseMs, maxMs },
        };
    }

    return { onTimeout, onSuccess, isDegraded, snapshot, isCritical };
}

module.exports = { createStallMonitor, isCritical, CRITICAL_METHODS };