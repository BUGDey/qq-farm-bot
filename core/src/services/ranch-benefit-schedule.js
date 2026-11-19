// 牧场每日福利自动化调度：把"开启时领一次 + 每天凌晨领 + 中午补领"变成可持久化的时机判定。
// 领取是否真的发生仍由服务端 dailyBenefit.available 决定，本模块只回答"本次巡查要不要去查/领"，
// 不伪造领取、不绕过限购。状态写到独立 json，按账号分区，重启后可恢复。
const { getDataFile } = require('../config/runtime-paths');
const { readJsonFile, writeJsonFileAtomic } = require('./json-db');

const STATE_FILE = () => getDataFile('ranch-benefit-schedule.json');
const accountKey = value => String(value || process.env.FARM_ACCOUNT_ID || 'default').replace(/[^\w.-]/g, '_');
// 与 worker 的 getLocalDateKey 一致：以 UTC+8 作为业务日界。
const localParts = now => new Date(Number(now) + 8 * 3600000);
const dateKey = now => localParts(now).toISOString().slice(0, 10);
const minuteOfDay = now => localParts(now).getUTCHours() * 60 + localParts(now).getUTCMinutes();

function readAll() {
    return readJsonFile(STATE_FILE(), () => ({})) || {};
}

// Completion and purchase dispatch are separate: an unconfirmed dispatch allows
// later status reads, but must not authorize another purchase in the same window.
function plan({ enabled, accountId, now = Date.now(), all = readAll() } = {}) {
    const { attempts, ...state } = all[accountKey(accountId)] || {};
    if (!enabled) return { shouldClaim: false, reason: 'disabled', state: { ...state, enabledBefore: false }, changed: state.enabledBefore === true };
    const today = dateKey(now);
    const minute = minuteOfDay(now);
    const window = minute < 60 ? 'midnight' : minute >= 690 && minute < 750 ? 'noon' : 'first-enable';
    const dateField = window === 'first-enable' ? null : `${window}Date`;
    const reason = state.enabledBefore !== true ? 'first-enable' : dateField && state[dateField] !== today ? window : 'idle';
    const armed = { ...state, enabledBefore: true };
    if (reason === 'idle') return { shouldClaim: false, reason, state: armed };
    if (dateField) armed[dateField] = today;
    return { shouldClaim: true, reason, state: armed, window, readOnly: attempts?.[window] === today };
}

function save(all, key, patch) {
    try {
        all[key] = { ...all[key], ...patch };
        writeJsonFileAtomic(STATE_FILE(), all, 2);
        return true;
    } catch {
        return false;
    }
}

function confirm({ accountId, state }) {
    return save(readAll(), accountKey(accountId), state);
}

function observeDisabled({ accountId, now }) {
    const all = readAll();
    const decision = plan({ enabled: false, accountId, now, all });
    if (decision.changed) return save(all, accountKey(accountId), decision.state);
    return true;
}

function markAttempt({ accountId, now }) {
    const key = accountKey(accountId);
    const all = readAll();
    const decision = plan({ enabled: true, accountId, now, all });
    if (!decision.shouldClaim || decision.readOnly) return false;
    return save(all, key, { attempts: { ...all[key]?.attempts, [decision.window]: dateKey(now) } });
}

function getState(accountId) {
    return readAll()[accountKey(accountId)] || {};
}

module.exports = { plan, confirm, observeDisabled, markAttempt, getState, accountKey, dateKey, minuteOfDay };
