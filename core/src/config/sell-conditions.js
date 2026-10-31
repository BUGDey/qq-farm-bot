'use strict';

/**
 * 道具出售条件（ItemInfo.sell_cond / cond_sells）。
 *
 * 官方配置里这两列只在"有限制"的道具上出现，共三种形态（2026-10 实测 39 条）：
 *   - `活动结束后:2026040201`  活动结束后才能卖（数字是活动结束日 + 期次）
 *   - `活动区间外:2026110101`  活动期间不能卖，活动结束后才能卖
 *   - `道具过期后:expire_time`  道具过期（自身的 expire_time 已过）后才能卖
 *
 * 服务端对不满足条件的道具会拒绝出售；如果本地不判断，就会出现
 * "一键卖出把活动道具卖掉/背包显示可售但点不动"的问题，因此这里做统一判断。
 *
 * 说明：活动期次编码 `YYYYMMDDNN`，这里按"该日 23:59:59（UTC+8）"作为结束时刻，
 * 早于该时刻一律视为活动仍在进行，宁可晚一天允许出售，也不提前卖掉活动道具。
 */

const CN_OFFSET_MS = 8 * 60 * 60 * 1000;
const ACTIVITY_ID_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})$/;

/** 把 `YYYYMMDDNN` 解析成活动结束时间戳（UTC+8 当日 23:59:59.999） */
function parseActivityEndMs(value) {
    const match = ACTIVITY_ID_RE.exec(String(value || '').trim());
    if (!match) return 0;
    const [, year, month, day] = match;
    const utcMidnight = Date.UTC(Number(year), Number(month) - 1, Number(day));
    if (!Number.isFinite(utcMidnight)) return 0;
    // 当日 24:00（UTC+8）减 1ms
    return utcMidnight + 24 * 60 * 60 * 1000 - CN_OFFSET_MS - 1;
}

/** 解析 sell_cond 字符串 → { kind, value } */
function parseSellCondition(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const index = text.indexOf(':');
    const kind = (index >= 0 ? text.slice(0, index) : text).trim();
    const value = index >= 0 ? text.slice(index + 1).trim() : '';
    if (!kind) return null;
    return { kind, value };
}

/** cond_sells：`1001:1000` → { currencyId, price } */
function parseCondSells(raw) {
    const match = /^(\d+)\s*:\s*(\d+)$/.exec(String(raw || '').trim());
    if (!match) return null;
    return { currencyId: Number(match[1]), price: Number(match[2]) };
}

function formatCnTime(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const date = new Date(ms + CN_OFFSET_MS);
    const pad = value => String(value).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * 判断一个道具当前能否出售。
 * @param {object} itemInfo ItemInfo 里的一条记录（含 sell_cond / cond_sells）
 * @param {{nowSec?: number, expireTime?: number}} [context]
 *   nowSec 用服务器时间（秒）；expireTime 为道具自身过期时间（毫秒或秒均可，>1e12 视为毫秒）
 * @returns {{sellable: boolean, blocked: string, reason: string, availableAt: number, priceInfo: object|null}}
 */
function evaluateSellCondition(itemInfo, context = {}) {
    const info = itemInfo || {};
    const condition = parseSellCondition(info.sell_cond);
    const priceInfo = parseCondSells(info.cond_sells);
    const nowMs = Number(context.nowSec) > 0 ? Number(context.nowSec) * 1000 : Date.now();
    const rawExpire = Number(context.expireTime) || 0;
    const expireMs = rawExpire > 1e12 ? rawExpire : rawExpire > 1e9 ? rawExpire * 1000 : 0;

    if (!condition) {
        return { sellable: true, blocked: '', reason: '', availableAt: 0, priceInfo };
    }

    if (condition.kind === '活动结束后' || condition.kind === '活动区间外') {
        const endMs = parseActivityEndMs(condition.value);
        if (endMs > 0 && nowMs <= endMs) {
            const reason = condition.kind === '活动区间外'
                ? `活动期间不可出售，${formatCnTime(endMs)} 后开放`
                : `活动结束后才可出售（${formatCnTime(endMs)} 后）`;
            return { sellable: false, blocked: 'activity', reason, availableAt: endMs, priceInfo };
        }
        return { sellable: true, blocked: '', reason: '', availableAt: endMs, priceInfo };
    }

    if (condition.kind === '道具过期后') {
        if (!expireMs || nowMs < expireMs) {
            const reason = expireMs
                ? `道具过期后可出售（${formatCnTime(expireMs)} 后）`
                : '道具过期后可出售（无过期时间信息）';
            return { sellable: false, blocked: 'expire', reason, availableAt: expireMs, priceInfo };
        }
        return { sellable: true, blocked: '', reason: '', availableAt: expireMs, priceInfo };
    }

    // 未知条件：宁可不卖，也不误卖
    return {
        sellable: false,
        blocked: 'unknown',
        reason: `未识别的出售条件：${info.sell_cond}`,
        availableAt: 0,
        priceInfo,
    };
}

module.exports = {
    parseActivityEndMs,
    parseSellCondition,
    parseCondSells,
    evaluateSellCondition,
};
