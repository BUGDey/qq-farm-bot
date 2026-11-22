// Independent randomized deadlines; due groups run serially on the shared connection.
const FRIEND_KEYS = ['autoSteal', 'autoHelp', 'autoStroke', 'autoPutHazard'];
// Preference switches never start a patrol without an actual action enabled.
const PREFERENCE_KEYS = ['autoStrokeSelected', 'autoExchangePriority'];
function hasEnabledAutomation(settings, group = 'all') {
    return Object.entries(settings).some(([key, value]) => value === true && !PREFERENCE_KEYS.includes(key) && inGroup(key, group));
}
function inGroup(key, group) {
    if (group === 'all') return true;
    if (group === 'steal') return key === 'autoSteal';
    if (group === 'help') return ['autoHelp', 'autoStroke', 'autoPutHazard'].includes(key);
    return !FRIEND_KEYS.includes(key);
}
function createRanchScheduler({ now = Date.now, random = Math.random } = {}) {
    const queues = Object.fromEntries(['farm', 'help', 'steal'].map(key => [key, { enabled: false, nextAt: 0, intervalSec: 0, running: false }]));
    let generation = 0;
    let ticking = false;
    function sync(settings, policy) {
        for (const [key, queue] of Object.entries(queues)) {
            const enabled = hasEnabledAutomation(settings, key);
            const signature = `${policy[`${key}Min`]}:${policy[`${key}Max`]}`;
            if (!enabled) Object.assign(queue, { enabled: false, nextAt: 0, intervalSec: 0 });
            else if (!queue.enabled || queue.signature !== signature) Object.assign(queue, { enabled: true, nextAt: now(), intervalSec: 0 });
            queue.signature = signature;
        }
    }
    function status(settings, policy) {
        sync(settings, policy);
        return Object.fromEntries(Object.entries(queues).map(([key, q]) => [key, { enabled: q.enabled, nextAt: q.nextAt, intervalSec: q.intervalSec, running: q.running }]));
    }
    async function tick({ settings, policy, run, stealDelay = () => 900000, ready = () => true }) {
        if (ticking) return;
        ticking = true;
        const epoch = generation;
        const errors = [];
        try {
            for (const [key, queue] of Object.entries(queues)) {
                if (epoch !== generation || !ready()) break;
                sync(settings(), policy());
                if (!queue.enabled || queue.running || now() < queue.nextAt) continue;
                queue.running = true;
                let result, failed = false;
                try {
                    try { result = await run(key); }
                    catch (err) { failed = true; throw err; }
                    finally {
                        if (epoch === generation) {
                            queue.running = false;
                            sync(settings(), policy());
                            if (queue.enabled) {
                                const p = policy();
                                const min = Math.max(1, Number(p[`${key}Min`]) || 10);
                                const max = Math.max(min, Number(p[`${key}Max`]) || min);
                                queue.intervalSec = key === 'steal' ? Math.max(1, Math.ceil(stealDelay() / 1000)) : min + Math.floor(random() * (max - min + 1));
                                const incomplete = result?.yielded || result?.cancelled || result?.status === 'cancelled' || result?.status === 'yielded' || result?.status === 'deferred';
                                queue.nextAt = incomplete ? now() : now() + (failed ? Math.max(5, queue.intervalSec) : queue.intervalSec) * 1000;
                                if (!failed && !incomplete && Number.isFinite(result?.nextAt)) queue.nextAt = Math.min(queue.nextAt, Math.max(now() + 1000, result.nextAt));
                            }
                        }
                    }
                } catch (err) {
                    // Match allSettled: settle every eligible group before reporting failures.
                    errors.push(err);
                }
                if (result?.cancelled || result?.status === 'cancelled') break;
            }
            if (errors.length) throw new AggregateError(errors, errors.map(err => err.message).join('; '));
        } finally {
            ticking = false;
        }
    }
    function reset() {
        generation++;
        // Keep the tick lock until the old run settles, even across a reset.
        for (const queue of Object.values(queues)) Object.assign(queue, { enabled: false, nextAt: 0, intervalSec: 0, running: false });
    }
    return { tick, status, reset };
}
module.exports = { createRanchScheduler, inGroup, hasEnabledAutomation };
