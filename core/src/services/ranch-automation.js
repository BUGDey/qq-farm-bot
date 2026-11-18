const { ACTION_SWITCH } = require('./ranch-settings');
const benefitSchedule = require('./ranch-benefit-schedule');
const { selectCub, feedTypes, quietNow, purchasableCubs } = require('./ranch-strategy');
const CONFIG = require('../gameConfig/RanchConfig.json');
const stock = (items, id, usable = false) => (items || []).filter(i => String(i.id) === String(id) && (!usable || (!i.locked && !i.is_locked && !i.isLocked && !i.detail?.ranchProduct && !i.item_detail?.ranch_product))).reduce((n, i) => n + BigInt(i.count || 0), 0n);
const cap = (...values) => Number(values.map(BigInt).reduce((a, b) => a < b ? a : b));
const canConfig = new Map(CONFIG.MCCanConfig.map(c => [String(c.id), c]));
const bucketId = can => can.feed_type === '有机罐头' ? '7004' : '7003';
function assertAutomationPolicy(input, p, { state, market, exchangeEnabled = false, simpleExchange = false } = {}) {
    const reject = () => { throw new Error('牧场自动策略已变化或超过库存/保留量/价格限制'); };
    if (['steal', 'friendProduce', 'help', 'stroke', 'putHazard'].includes(input.action)) {
        const host = String(input.hostGid);
        if (p.friendExcludeGids.includes(host) || (p.friendIncludeGids.length && !p.friendIncludeGids.includes(host))) reject();
    } else if (input.action === 'sell') {
        // Inventory and lock validation is shared with manual sales. Historical
        // mode/whitelist/reserve/quantity policies do not constrain auto selling.
    } else if (input.action === 'useCan') {
        const can = canConfig.get(String(input.itemId));
        if (!can || !p.canItemIds.includes(String(input.itemId)) || input.count > p.canMaxPerRun || stock(state.items, input.itemId, true) - BigInt(input.count) < BigInt(p.canReserveCount) || stock(state.items, bucketId(can)) + BigInt(input.count * can.speed_up_secs) > BigInt(p.bucketTargetSeconds)) reject();
    } else if (input.action === 'addFeed') {
        const machine = state.facilities.find(f => String(f.instId) === String(input.facilityInstId));
        if (!machine?.feedMachine || Number(machine.feedMachine.feedCount) + input.count > p.feedTargetCount || stock(state.items, '7001', true) - BigInt(input.count) < BigInt(p.feedReserveCount)) reject();
    } else if (input.action === 'place') {
        if (!p.cubItemIds.includes(String(input.itemId))) reject();
    } else if (input.action === 'buy' || input.action === 'exchange') {
        if (input.action === 'exchange' && simpleExchange) {
            if (!market || !['7002', '1008'].includes(market.costItemId) || market.price <= 0n || market.balance < market.price * BigInt(input.count)) reject();
            return;
        }
        const rule = p[input.action === 'buy' ? 'buyRules' : 'exchangeRules'].find(r => r.goodsId === String(input.goodsId));
        if (!rule || !market || input.count > rule.maxPerRun || market.price > BigInt(rule.maxUnitPrice)) reject();
        if (input.action === 'exchange' && (rule.itemId !== market.itemId || rule.costItemId !== market.costItemId)) reject();
        const reserve = market.costItemId === '1007' ? p.goldReserve : market.costItemId === '7002' ? p.poopReserve : market.costItemId === '1008' ? p.pineReserve : null;
        if (reserve === null || market.balance - market.price * BigInt(input.count) < BigInt(reserve)) reject();
        const items = [...(market.bag.physical_items || []), ...(market.bag.virtual_items || [])];
        if (!(market.itemCount > 0) || stock(items, market.itemId) + BigInt(input.count * market.itemCount) > BigInt(rule.targetStock)) reject();
    }
}
async function runRanchExtraAutomation(ctx) {
    const { service, attempt, settings, policy, alive: isAlive, goodsMap, getCursor, setCursor, logError } = ctx;
    let used = 0, cancelled = false;
    const alive = () => !cancelled && isAlive();
    const enabled = key => {
        if (settings()[key] && used >= policy().maxActionsPerRun) ctx.onLimit?.();
        return alive() && settings()[key] && used < policy().maxActionsPerRun;
    };
    const perform = async (input, key = ACTION_SWITCH[input.action]) => {
        if (ctx.hasCompleted?.(input, key) || !enabled(key)) return;
        used++;
        return attempt(input, key);
    };
    const safely = async fn => {
        if (!alive()) return;
        try { await fn(); } catch (err) {
            if (['REQUEST_TIMEOUT', 'ENCODE_TIMEOUT', 'CONNECTION_CLOSED', 'SCENE_CANCELLED'].includes(err.code)) cancelled = true;
            logError(err);
        }
    };
    if (enabled('autoDailyBenefit')) await safely(async () => {
        // 每日福利按"开启即领一次 + 每日凌晨 + 中午补领"的时机判定触发，
        // 避免每轮巡查都打商城接口；服务端 available 仍是防重复的最终闸门。
        const decision = benefitSchedule.plan({ enabled: true, accountId: ctx.accountId, now: ctx.now ? ctx.now() : Date.now() });
        if (!decision.shouldClaim) return;
        const benefit = await service.getResource('dailyBenefit');
        // 服务端说今天已领：本次窗口完成，落盘避免重复查询。
        if (benefit?.claimed) {
            benefitSchedule.confirm({ accountId: ctx.accountId, state: decision.state });
            return;
        }
        // 确实可领才发购买；领取后落盘。未下发/暂不可领不落盘，下一窗口再试。
        if (benefit?.available) {
            await perform({ action: 'dailyBenefit' });
            benefitSchedule.confirm({ accountId: ctx.accountId, state: decision.state });
        }
    });
    if (enabled('autoAddFeed')) await safely(async () => {
        const facilities = (await service.getStatus()).facilities;
        for (const original of facilities.filter(f => f.feedMachine)) {
            if (!enabled('autoAddFeed')) break;
            const state = await service.getStatus(); const p = policy();
            const facility = state.facilities.find(f => String(f.instId) === String(original.instId));
            if (!facility?.feedMachine) continue;
            const surplus = stock(state.items, '7001', true) - BigInt(p.feedReserveCount);
            const capacity = Number(facility.capacity);
            const filled = Number(facility.feedMachine.feedCount);
            // 填充率已达阈值就跳过；阈值只决定“要不要补”，补的量仍是补到栏舍上限。
            const thresholdPercent = Number(p.grassThresholdPercent);
            if (capacity > 0 && filled * 100 >= capacity * thresholdPercent) continue;
            const gap = Math.min(capacity, p.feedTargetCount) - filled;
            if (!(gap > 0) || surplus <= 0n) continue;
            const count = cap(gap, surplus, 2147483647);
            if (count > 0) await perform({ action: 'addFeed', facilityInstId: facility.instId, count });
        }
    });
    // Currency opt-ins follow the current market; never use gold/diamonds or stale rounds.
    if (enabled('autoExchangePoop') || enabled('autoExchangePine')) await safely(async () => {
        const initial = (await service.getResource('shop')).exchangeMarket;
        if (!initial?.opened || !initial.present) return;
        // 便便兑换按官方补给顺序优先换有机化肥（4小时 80012 先于 1小时 80011）；
        // 关闭该开关时保持原有集市顺序，其它 7002 商品照旧参与，不影响覆盖面。
        const POOP_PRIORITY = ['80012', '80011'];
        const organicFirst = settings().autoExchangeOrganicFirst === true;
        const rank = goods => {
            const index = POOP_PRIORITY.indexOf(String(goods.itemId));
            return organicFirst && index >= 0 ? index : POOP_PRIORITY.length;
        };
        const ordered = [...(initial.goods || [])].sort((a, b) => rank(a) - rank(b));
        for (const original of ordered) await safely(async () => {
            const key = String(original.costItemId) === '7002' ? 'autoExchangePoop' : String(original.costItemId) === '1008' ? 'autoExchangePine' : null;
            if (!key || !enabled(key)) return;
            const market = (await service.getResource('shop')).exchangeMarket;
            if (!market?.opened || !market.present) return;
            const goods = market.goods?.find(g => String(g.goodsId) === String(original.goodsId) && String(g.costItemId) === String(original.costItemId) && String(g.itemId) === String(original.itemId));
            if (!goods) return;
            const state = await service.getStatus();
            if (state.sectionErrors?.warehouse) return;
            const price = BigInt(goods.effectiveCostCount || 0);
            const available = BigInt(goods.limitCount || 0) > 0n ? BigInt(goods.limitCount) - BigInt(goods.limitUsed || goods.boughtNum || 0) : 99n;
            // Each request remains capped; the live action rechecks currency, stock and round.
            if (price <= 0n || available <= 0n) return;
            const count = cap(99, available, stock(state.items, goods.costItemId, true) / price);
            if (count > 0) await perform({ action: 'exchange', goodsId: String(goods.goodsId), count, costCount: String(price), costItemId: String(goods.costItemId), periodDay: market.periodDay, roundIndex: market.roundIndex }, key);
        });
    });
    // Buy/exchange to target stock first; later inventory tasks can use newly acquired supplies.
    for (const mode of ['buy', 'exchange']) {
        const key = mode === 'buy' ? 'autoBuy' : 'autoExchange';
        for (const originalRule of policy()[mode === 'buy' ? 'buyRules' : 'exchangeRules']) await safely(async () => {
            if (!enabled(key)) return;
            const p = policy();
            const rule = p[mode === 'buy' ? 'buyRules' : 'exchangeRules'].find(r => r.goodsId === originalRule.goodsId);
            if (!rule) return;
            const shop = await service.getResource('shop');
            const state = await service.getStatus();
            if (state.sectionErrors?.warehouse) return;
            let goods, itemId, itemCount, price, balance, reserve, maxCount;
            let payload;
            if (mode === 'buy') {
                const row = goodsMap.get(rule.goodsId);
                if (!row || ![5, 6].includes(row.shop_id) || row.price_id !== 1007) return;
                goods = shop.shops.find(s => s.shopId === row.shop_id)?.goodsList?.find(g => String(g.id) === rule.goodsId);
                if (!goods?.unlocked || goods.owned) return;
                itemId = String(row.item_id); itemCount = Number(row.item_count); price = BigInt(goods.price || 0);
                balance = stock(state.items, '1007', true); reserve = p.goldReserve; maxCount = row.one_buy_count || 99;
                payload = { action: mode, goodsId: rule.goodsId, price: String(price) };
            } else {
                const market = shop.exchangeMarket;
                if (!market?.opened || !market.present) return;
                goods = market.goods?.find(g => String(g.goodsId) === rule.goodsId);
                if (!goods || !['7002', '1008'].includes(String(goods.costItemId)) || rule.itemId !== String(goods.itemId) || rule.costItemId !== String(goods.costItemId)) return;
                itemId = String(goods.itemId); itemCount = Number(goods.itemCount); price = BigInt(goods.effectiveCostCount || 0);
                balance = stock(state.items, goods.costItemId, true); reserve = goods.costItemId === '7002' ? p.poopReserve : p.pineReserve; maxCount = 99;
                payload = { action: mode, goodsId: rule.goodsId, costCount: String(price), costItemId: String(goods.costItemId), periodDay: market.periodDay, roundIndex: market.roundIndex };
            }
            if (!(itemCount > 0) || price <= 0n || price > BigInt(rule.maxUnitPrice) || balance <= BigInt(reserve)) return;
            const gap = BigInt(rule.targetStock) - stock(state.items, itemId);
            if (gap < BigInt(itemCount)) return;
            const limitCount = BigInt(goods.limitCount || 0);
            const available = limitCount > 0n ? limitCount - BigInt(goods.boughtNum || goods.limitUsed || 0) : 99999n;
            if (available <= 0n) return;
            const count = cap(rule.maxPerRun, maxCount, gap / BigInt(itemCount), (balance - BigInt(reserve)) / price, available);
            if (count > 0) await perform({ ...payload, count });
        });
    }
    if (enabled('autoSell')) await safely(async () => {
        const state = await service.getStatus();
        const items = state.items.filter(item => item.canSell && BigInt(item.count || 0) > 0n)
            .map(item => ({ itemId: String(item.id), uid: item.uid || '0', count: Number(item.count) }));
        if (items.length) await perform({ action: 'sell', items });
    });
    if (enabled('autoUseCan')) for (const id of policy().canItemIds) await safely(async () => {
        if (!enabled('autoUseCan')) return;
        const can = canConfig.get(id);
        if (!can) return;
        const state = await service.getStatus(); const p = policy();
        const item = state.items.find(i => String(i.id) === id && i.canUseCan && !i.locked);
        const surplus = stock(state.items, id, true) - BigInt(p.canReserveCount);
        const gap = BigInt(p.bucketTargetSeconds) - stock(state.items, bucketId(can));
        if (!item || surplus <= 0n || gap < BigInt(can.speed_up_secs)) return;
        const count = cap(item.count, surplus, gap / BigInt(can.speed_up_secs), p.canMaxPerRun);
        if (count > 0) await perform({ action: 'useCan', itemId: id, uid: item.uid || '0', count });
    });
    if (enabled('autoPlace')) await safely(async () => {
        const ranches = (await service.getStatus()).ranches;
        for (const original of ranches) {
            if (!enabled('autoPlace')) break;
            const state = await service.getStatus();
            const ranch = state.ranches.find(r => String(r.ranchInstId) === String(original.ranchInstId));
            if (!ranch || Number(ranch.animalCount) >= Number(ranch.capacity)) continue;
            const p = policy();
            const bagPriority = p.mode === 'simple' && p.husbandryStrategy === 'bag_priority';
            const inventory = (ranch.availableCubs || []).filter(c => BigInt(c.count || 0) > 0n);
            const useBag = bagPriority && inventory.length > 0;
            const strategy = bagPriority ? p.husbandryFallbackStrategy : p.husbandryStrategy;
            const shop = p.mode === 'simple' && !useBag ? await service.getResource('shop') : null;
            const candidates = useBag ? inventory : shop ? purchasableCubs(ranch, shop, goodsMap) : ranch.availableCubs;
            const cub = p.mode === 'simple' ? selectCub(candidates, useBag ? 'level' : strategy, !useBag && strategy === 'task' ? (await service.getResource('tasks')).tasks : []) : p.cubItemIds.map(id => ranch.availableCubs.find(c => String(c.itemId) === id)).find(Boolean);
            if (cub) await perform({ action: 'place', ranchId: ranch.ranchInstId, itemId: cub.itemId, ...(useBag ? { source: 'bag' } : {}) });
        }
    });
    if (enabled('autoFeedAnimal')) await safely(async () => {
        const state = await service.getStatus();
        for (const ranch of state.ranches) for (const animal of ranch.animals) {
            for (const bucketType of feedTypes(animal, policy(), (ctx.now || Date.now)())) {
                if (!enabled('autoFeedAnimal')) break;
                if (stock(state.items, bucketType === 1 ? '7004' : '7003', true) > 0n) await perform({ action: 'feedAnimal', ranchId: ranch.ranchInstId, animalInstId: animal.animalInstId, bucketType });
            }
        }
    });
    if (enabled('autoUpgradeRanch') || enabled('autoUpgradeFacilities')) await safely(async () => {
        for (const facility of (await service.getStatus()).facilities) {
            const key = facility.facilityKind === 'MODULE_TYPE_MAIN_CITY' ? 'autoUpgradeRanch' : 'autoUpgradeFacilities';
            if (!enabled(key)) continue;
            if (Number(facility.state) === 3 && facility.facilityKind === 'MODULE_TYPE_RANCH_SHED') {
                await perform({ action: 'activateFacility', facilityInstId: facility.instId }, key);
                continue; // Upgrade from a fresh snapshot on the next scheduler pass.
            }
            if (facility.state != null && Number(facility.state) !== 1) continue;
            if (facility.upgradeState) {
                if (Number(facility.upgradeEndTime) > 0 && Number(facility.upgradeEndTime) * 1000 <= (ctx.now || Date.now)()) await perform({ action: 'completeUpgrade', facilityInstId: facility.instId }, key);
            } else if (facility.nextLevel && facility.nextUpgradeCost.length && !facility.upgradeBlockedReason) {
                await perform({ action: 'upgradeBuilding', facilityInstId: facility.instId, costs: facility.nextUpgradeCost }, key);
            }
        }
    });
    const friendKeys = ['autoSteal', 'autoHelp', 'autoStroke', 'autoPutHazard'];
    if (friendKeys.some(enabled) && !quietNow(policy(), (ctx.now || Date.now)())) await safely(async () => {
        const p = policy();
        const continuation = ctx.continuation;
        if (ctx.maturityPlan && !continuation?.friendBatch && !ctx.maturityPlan.isDue(settings())) return;
        let friends, size, start;
        if (continuation?.friendBatch) ({ friends, size, start } = continuation.friendBatch);
        else {
            const all = (await service.getResource('friends')).friends || [];
            friends = all.filter(f => !p.friendExcludeGids.includes(String(f.gid)) && (!p.friendIncludeGids.length || p.friendIncludeGids.includes(String(f.gid))));
            if (ctx.maturityPlan) friends = ctx.maturityPlan.select(friends, p.friendBatchSize, settings(), p);
            size = Math.min(friends.length, p.friendBatchSize);
            start = ctx.maturityPlan ? 0 : friends.length ? getCursor() % friends.length : 0;
            if (continuation) continuation.friendBatch = { friends, size, start, completed: new Set() };
        }
        if (!friends.length) setCursor(0);
        for (let offset = 0; offset < size; offset++) await safely(async () => {
            if (!friendKeys.some(enabled)) return;
            if (continuation?.friendBatch.completed.has(offset)) return;
            setCursor((start + offset + 1) % friends.length);
            const hostGid = String(friends[(start + offset) % friends.length].gid);
            const current = policy();
            if (current.friendExcludeGids.includes(hostGid) || (current.friendIncludeGids.length && !current.friendIncludeGids.includes(hostGid))) return;
            const visit = await service.action({ action: 'visitFriend', hostGid });
            ctx.maturityPlan?.observe(hostGid, visit.friend?.ranches);
            // Missing quota is not permission to write. Refresh from each completed
            // hazard action so multiple sheds cannot reuse the same remaining count.
            const hazardQuota = friend => {
                const value = String(friend?.ops?.find(op => String(op.opId) === '11003')?.remainingTimes ?? '');
                return /^\d+$/.test(value) ? BigInt(value) : 0n;
            };
            let hazardsRemaining = hazardQuota(visit.friend);
            for (const ranch of visit.friend?.ranches || []) {
                const base = { hostGid, ranchId: ranch.ranchInstId };
                if (enabled('autoHelp') && (!ctx.maturityPlan || ctx.maturityPlan.canHelp(hostGid)) && ranch.hazards?.length) await perform({ ...base, action: 'help' });
                // Production can immediately create stealable shelves. Only consume freshly
                // queried shelves, never infer loot or retry a completed production write.
                let stealRanch = ranch;
                if (enabled('autoSteal') && (!ctx.maturityPlan || ctx.maturityPlan.canSteal(hostGid))) {
                    for (const animal of ranch.animals || []) if (animal.canTriggerProduce) {
                        const produced = await perform({ ...base, action: 'friendProduce', animalInstId: animal.animalInstId });
                        if (produced) stealRanch = produced.friend?.ranches?.find(r => String(r.ranchInstId) === String(ranch.ranchInstId)) || { shelves: [] };
                    }
                }
                if (enabled('autoSteal') && (!ctx.maturityPlan || ctx.maturityPlan.canSteal(hostGid))) for (const shelf of stealRanch.shelves || []) if (shelf.canSteal) await perform({ ...base, action: 'steal', slotIndex: shelf.slotIndex });
                if (enabled('autoStroke') && (!ctx.maturityPlan || ctx.maturityPlan.canHelp(hostGid))) for (const animal of ranch.animals || []) if (animal.canStroke) await perform({ ...base, action: 'stroke', animalInstId: animal.animalInstId });
                if (enabled('autoPutHazard') && hazardsRemaining > 0n && (!ctx.maturityPlan || ctx.maturityPlan.canHelp(hostGid))) {
                    const placed = await perform({ ...base, action: 'putHazard' });
                    hazardsRemaining = hazardQuota(placed?.friend);
                }
            }
            // Keep the current friend in the continuation until all its safe actions
            // have been considered. Maturity observation must not discard a yielded tail.
            if (alive() && used < policy().maxActionsPerRun) continuation?.friendBatch.completed.add(offset);
        });
    });
}
module.exports = { runRanchExtraAutomation, assertAutomationPolicy };
