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

/**
 * 返回 { shouldClaim, reason, state }。
 * state 是"如果这次真的领取成功应当落盘的状态"，由调用方在确认领取/今日已领后 confirm()。
 * 领取失败时不确认，下一次巡查会在同一窗口内重试（服务端 available 仍是最终防重复闸门）。
 */
function plan({ enabled, accountId, now = Date.now(), all = readAll() } = {}) {
    const key = accountKey(accountId);
    const state = { ...(all[key] || {}) };
    const today = dateKey(now);
    const minute = minuteOfDay(now);
    if (!enabled) {
        state.enabledBefore = false;
        return { shouldClaim: false, reason: 'disabled', state };
    }
    const armed = { ...state, enabledBefore: true };
    // 首次开启：从关闭切成开启后立刻执行一次。
    if (state.enabledBefore !== true) return { shouldClaim: true, reason: 'first-enable', state: armed };
    // 每日凌晨窗口 00:00–00:59，每天最多一次。
    if (minute < 60 && state.midnightDate !== today) return { shouldClaim: true, reason: 'midnight', state: { ...armed, midnightDate: today } };
    // 中午补领窗口 11:30–12:29，每天最多一次。
    if (minute >= 690 && minute < 750 && state.noonDate !== today) return { shouldClaim: true, reason: 'noon', state: { ...armed, noonDate: today } };
    return { shouldClaim: false, reason: 'idle', state: armed };
}

function confirm({ accountId, state }) {
    try {
        const all = readAll();
        all[accountKey(accountId)] = { ...state };
        writeJsonFileAtomic(STATE_FILE(), all, 2);
        return true;
    } catch {
        return false;
    }
}

function getState(accountId) {
    return readAll()[accountKey(accountId)] || {};
}

module.exports = { plan, confirm, getState, accountKey, dateKey, minuteOfDay };
