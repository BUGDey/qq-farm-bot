/** Account-wide scene executor. A lease covers a complete business transaction, not one RPC. */
const { AsyncLocalStorage } = require('node:async_hooks');
function createRanchSession({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
    minDwellMs = 15000, maxWaitMs = 30000, batchBudgetMs = 10000, maxQueued = 100 } = {}) {
    const context = new AsyncLocalStorage();
    let suspended = false;
    let epoch = 0, active = null, scene = null, enteredAt = 0, wake = null;
    let transition = async () => {}, onEvent = () => {}, retryAt = 0;
    const retryByScene = new Map();
    const blockedScenes = new Map();
    const pending = [];
    const keyed = new Map();
    const cancelled = () => Object.assign(new Error('账号连接已重置或场景事务已结束，旧请求已取消'), { code: 'SCENE_CANCELLED' });
    function assertAllowed() {
        const lease = context.getStore();
        if (suspended) throw new Error('账号场景调度已停止，等待重新登录');
        if (lease && (lease.epoch !== epoch || lease.closed)) throw cancelled();
        if (lease?.invalid) throw lease.entryFailed && lease.failure ? lease.failure : cancelled();
    }
    function invalidate() { scene = null; if (active) active.prepared = false; }
    function clearWake() { if (wake !== null) clearTimer(wake); wake = null; }
    function choose() {
        const first = pending.find(item => now() - item.queuedAt >= maxWaitMs) || pending.find(item => item.manual) || pending[0];
        if (!first || first.manual || first.scene === 'neutral' || scene === null || first.scene === scene) return first;
        const age = now() - first.queuedAt;
        if (age >= maxWaitMs || now() - enteredAt >= minDwellMs) return first;
        const same = pending.find(item => item.scene === scene);
        if (same) return same;
        const wait = Math.max(1, Math.min(minDwellMs - (now() - enteredAt), maxWaitMs - age));
        wake = setTimer(() => { wake = null; pump(); }, wait);
        return null;
    }
    function pump() {
        if (active) return;
        clearWake();
        const item = choose();
        if (!item) return;
        pending.splice(pending.indexOf(item), 1);
        const lease = { scene: item.scene, epoch: item.epoch, closed: false, invalid: false,
            prepared: false, visiting: false, requests: Promise.resolve(), startedAt: now() };
        active = lease;
        context.run(lease, async () => {
            let result, error;
            try { assertAllowed(); result = await item.fn(); }
            catch (err) { error = err; }
            // Drain even accidentally unawaited RPCs before another lease can acquire the connection.
            await lease.requests.catch(() => {});
            if (lease.epoch !== epoch) error = cancelled();
            if (lease.epoch === epoch && (lease.visiting || (lease.invalid && !lease.preserveScene))) invalidate();
            if (!error && lease.failure) error = lease.failure;
            lease.closed = true;
            if (now() - lease.startedAt > batchBudgetMs) onEvent('batch_overrun', { scene: lease.scene, elapsedMs: now() - lease.startedAt });
            active = null;
            if (item.key && keyed.get(item.key) === item.promise) keyed.delete(item.key);
            if (error) item.reject(error); else item.resolve(result);
            pump();
        }).catch(err => { onEvent('executor_error', { message: err.message }); });
    }
    function inScene(target, fn, options = {}) {
        assertAllowed();
        const lease = context.getStore();
        if (lease) {
            if (lease.scene !== target) return Promise.reject(new Error('禁止在场景事务中嵌套切换场景'));
            return fn();
        }
        const key = options.key ? `${target}:${options.key}` : null;
        if (key && keyed.has(key)) return keyed.get(key);
        if (pending.length >= maxQueued) return Promise.reject(new Error('账号场景任务队列已满'));
        let resolve, reject;
        const promise = new Promise((a, b) => { resolve = a; reject = b; });
        if (key) keyed.set(key, promise);
        pending.push({ scene: target, fn, epoch, queuedAt: now(), manual: !!options.manual, key, promise, resolve, reject });
        pump();
        return promise;
    }
    async function prepare(lease) {
        assertAllowed();
        if (lease.prepared) return;
        if (lease.scene === 'neutral') { lease.prepared = true; return; }
        if (scene !== lease.scene) {
            const backoff = retryByScene.get(lease.scene);
            const blocked = blockedScenes.get(lease.scene);
            if (blocked || now() < (backoff?.retryAt || 0)) {
                const error = blocked || Object.assign(new Error(`${lease.scene === 'ranch' ? '牧场' : '农场'}场景切换失败退避中，暂不执行业务请求`), { code: 'SCENE_BACKOFF' });
                lease.invalid = true; lease.entryFailed = true; lease.preserveScene = true; lease.failure = error; throw error;
            }
            try {
                await transition(lease.scene);
                assertAllowed();
                scene = lease.scene; enteredAt = now();
                retryByScene.delete(lease.scene);
                retryAt = Math.max(0, ...[...retryByScene.values()].map(b => b.retryAt));
                onEvent('scene_enter', { scene });
            } catch (err) {
                if (lease.epoch !== epoch) throw cancelled();
                lease.invalid = true; lease.entryFailed = true; lease.failure = err;
                // An explicit refusal/local capability check does not change the server scene.
                lease.preserveScene = /1045002/.test(`${err.code} ${err.message}`) || ['SCENE_LOCKED', 'SCENE_LOGIN_UNSUPPORTED'].includes(err.code);
                if (!lease.preserveScene) invalidate();
                if (lease.preserveScene) blockedScenes.set(lease.scene, err);
                else {
                    const count = retryByScene.get(lease.scene)?.failures || 0;
                    retryByScene.set(lease.scene, { retryAt: now() + Math.min(60000, 5000 * 2 ** Math.min(count, 4)), failures: count + 1 });
                }
                retryAt = Math.max(0, ...[...retryByScene.values()].map(b => b.retryAt));
                throw err;
            }
        }
        lease.prepared = true;
    }
    async function run(service, method, fn) {
        // Connection-global heartbeat/ACE may run alongside a business transaction.
        if (service === 'gamepb.acepb.AceService' || (service === 'gamepb.userpb.UserService' && method === 'Heartbeat')) return context.exit(fn);
        assertAllowed();
        const lease = context.getStore();
        if (!lease) return inScene(service === 'gamepb.acepb.AceService' ? 'neutral' : 'farm', () => run(service, method, fn));
        const task = lease.requests.then(async () => {
            await prepare(lease);
            assertAllowed();
            const visit = /VisitService$/.test(service);
            // A failed visit can also have changed server state; fail closed until re-entry.
            if (visit && ['Enter', 'EnterHomestead'].includes(method)) lease.visiting = true;
            try {
                const result = await fn();
                assertAllowed();
                if (visit && ['Leave', 'LeaveHomestead'].includes(method)) lease.visiting = false;
                return result;
            } catch (err) {
                if (visit || /1045108|REQUEST_TIMEOUT|ENCODE_TIMEOUT|CONNECTION_CLOSED/.test(`${err.code} ${err.message}`)) {
                    lease.invalid = true; lease.failure = err; invalidate();
                }
                throw err;
            }
        });
        lease.requests = task.catch(() => {});
        return task;
    }
    return {
        assertAllowed, run, adoptScene: target => { scene = target; enteredAt = now(); }, getEpoch: () => epoch,
        inFarm: (fn, options) => inScene('farm', fn, options),
        inRanch: (fn, options) => inScene('ranch', fn, options),
        detached: fn => context.exit(fn),
        configure: options => { transition = options.transition || transition; onEvent = options.onEvent || onEvent; },
        shouldYield: () => {
            const lease = context.getStore();
            return !!lease && pending.some(item => item.scene !== lease.scene)
                && (now() - lease.startedAt >= batchBudgetMs || pending.some(item => item.manual || now() - item.queuedAt >= maxWaitMs));
        },
        snapshot: () => ({ scene, epoch, suspended, activeScene: active?.scene || null, queued: pending.length, retryAt, blockedScenes: [...blockedScenes.keys()] }),
        // 当前异步上下文是否就在正在执行的那个场景事务里（后台补数据的让路判断需要区分）
        insideActiveScene: () => {
            const lease = context.getStore();
            return !!lease && !!active && lease.scene === active.scene;
        },
        suspend: () => { suspended = true; },
        resume: () => { suspended = false; },
        reset: () => {
            epoch++; scene = null; retryAt = 0; retryByScene.clear(); blockedScenes.clear(); clearWake();
            for (const item of pending.splice(0)) item.reject(cancelled());
            keyed.clear();
            if (active) active.invalid = true;
        },
    };
}
const ranchSession = createRanchSession();
module.exports = { createRanchSession, ranchSession };
