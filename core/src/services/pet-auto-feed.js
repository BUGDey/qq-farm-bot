/**
 * 宠物自动喂食
 *
 * 规则（面板「宠物自动喂食」可设置保持天数，默认 10 天）：
 *   1. 守护剩余时长 ≥ 保持天数 → 不喂
 *   2. 有 1 天狗粮 → 用 1 天狗粮补到保持天数
 *   3. 没有 1 天狗粮 → 等剩余 ≤ 7 天时喂 3 天狗粮
 *   4. 没有 3 天狗粮 → 等剩余 ≤ 5 天时喂 5 天狗粮
 *   5. 都没货 → 记录原因，等下次检查
 */

const { getPetAutoFeed } = require('../models/store');
const { log } = require('../utils/utils');
const { feedDog, getPetOverview } = require('./pets');

const DAY_SECONDS = 86400;
const FOOD_1_DAY = 90004;
const FOOD_3_DAY = 90005;
const FOOD_5_DAY = 90006;
/** 单次最多喂几份，避免一次把库存清空 */
const MAX_FEED_PER_RUN = 10;
/** 很短的时间内不重复检查（手动触发可绕过） */
const MIN_INTERVAL_MS = 60 * 1000;

const state = {
    lastRunAt: 0,
    lastAttemptAt: 0,
    lastResult: '',
    lastFedAt: 0,
    running: false
};

function foodStock(foods) {
    const stock = new Map();
    for (const food of Array.isArray(foods) ? foods : []) {
        const id = Number(food && food.id) || 0;
        if (!id) continue;
        stock.set(id, Math.max(0, Number(food.count) || 0));
    }
    return stock;
}

/**
 * 纯函数：根据剩余天数与库存决定这一轮喂什么
 * @returns {{foodId:number, days:number, count:number, reason:string} | null}
 */
function pickFeedPlan({ keepDays, currentDays, stock }) {
    const keep = Math.max(1, Math.round(Number(keepDays) || 10));
    const days = Math.max(0, Number(currentDays) || 0);
    if (days >= keep) return null;

    const need = keep - days;
    const oneDay = stock.get(FOOD_1_DAY) || 0;
    if (oneDay > 0) {
        return {
            foodId: FOOD_1_DAY,
            days: 1,
            count: Math.min(oneDay, MAX_FEED_PER_RUN, need),
            reason: 'feed_1d'
        };
    }

    const threeDay = stock.get(FOOD_3_DAY) || 0;
    if (days <= 7 && threeDay > 0) {
        return {
            foodId: FOOD_3_DAY,
            days: 3,
            count: Math.min(threeDay, MAX_FEED_PER_RUN, Math.max(1, Math.ceil(need / 3))),
            reason: 'feed_3d'
        };
    }

    const fiveDay = stock.get(FOOD_5_DAY) || 0;
    if (days <= 5 && fiveDay > 0) {
        return {
            foodId: FOOD_5_DAY,
            days: 5,
            count: Math.min(fiveDay, MAX_FEED_PER_RUN, Math.max(1, Math.ceil(need / 5))),
            reason: 'feed_5d'
        };
    }

    return null;
}

async function runPetAutoFeedOnce({ reason = 'timer', force = false } = {}) {
    const config = getPetAutoFeed();
    if (!config.enabled) {
        state.lastResult = '未开启自动喂食';
        return { ok: false, skipped: 'disabled' };
    }
    if (state.running) return { ok: false, skipped: 'busy' };
    if (!force && Date.now() - state.lastAttemptAt < MIN_INTERVAL_MS) {
        return { ok: false, skipped: 'throttled' };
    }

    state.running = true;
    state.lastAttemptAt = Date.now();
    try {
        const overview = await getPetOverview();
        const currentDays = Math.floor((Number(overview && overview.foodSeconds) || 0) / DAY_SECONDS);
        const stock = foodStock(overview && overview.foods);
        const plan = pickFeedPlan({ keepDays: config.keepDays, currentDays, stock });

        if (!plan) {
            const hasAnyFood = [FOOD_1_DAY, FOOD_3_DAY, FOOD_5_DAY].some(id => (stock.get(id) || 0) > 0);
            state.lastResult = currentDays >= config.keepDays
                ? `剩余 ${currentDays} 天，已达到保持天数 ${config.keepDays} 天`
                : hasAnyFood
                    ? `剩余 ${currentDays} 天，等待更低时长再喂`
                    : `剩余 ${currentDays} 天，背包里没有狗粮`;
            state.lastRunAt = Date.now();
            return { ok: true, skipped: 'no_plan', currentDays, keepDays: config.keepDays };
        }

        await feedDog(plan.foodId, plan.count);
        state.lastRunAt = Date.now();
        state.lastFedAt = Date.now();
        state.lastResult = `喂食 ${plan.count} 份（${plan.days} 天粮），原剩余 ${currentDays} 天`;
        log('宠物', `自动喂食：补充 ${plan.days} 天狗粮 ×${plan.count}（原剩余 ${currentDays} 天，目标 ${config.keepDays} 天）`, {
            module: 'pet',
            event: '自动喂食',
            result: 'ok',
            foodId: plan.foodId,
            count: plan.count,
            currentDays,
            keepDays: config.keepDays,
            reason
        });
        return { ok: true, fed: true, plan, currentDays, keepDays: config.keepDays };
    } catch (error) {
        state.lastRunAt = Date.now();
        state.lastResult = `喂食失败：${error.message}`;
        log('宠物', `自动喂食失败: ${error.message}`, { module: 'pet', event: '自动喂食', result: 'error' });
        return { ok: false, error: error.message };
    } finally {
        state.running = false;
    }
}

function getPetAutoFeedState() {
    return { ...state, config: getPetAutoFeed() };
}

function resetPetAutoFeedState() {
    state.lastRunAt = 0;
    state.lastAttemptAt = 0;
    state.lastResult = '';
    state.lastFedAt = 0;
    state.running = false;
}

module.exports = {
    DAY_SECONDS,
    FOOD_1_DAY,
    FOOD_3_DAY,
    FOOD_5_DAY,
    MAX_FEED_PER_RUN,
    pickFeedPlan,
    runPetAutoFeedOnce,
    getPetAutoFeedState,
    resetPetAutoFeedState,
    _state: state
};
