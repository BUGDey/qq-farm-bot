const { ACTION_SWITCH } = require('./ranch-settings');
const benefitSchedule = require('./ranch-benefit-schedule');
const { selectCub, feedTypes, quietNow, purchasableCubs } = require('./ranch-strategy');
const CONFIG = require('../gameConfig/RanchConfig.json');
const stock = (items, id, usable = false) => (items || []).filter(i => String(i.id) === String(id) && (!usable || (!i.locked && !i.is_locked && !i.isLocked && !i.detail?.ranchProduct && !i.item_detail?.ranch_product))).reduce((n, i) => n + BigInt(i.count || 0), 0n);
const cap = (...values) => Number(values.map(BigInt).reduce((a, b) => a < b ? a : b));
// 兑换货币余额：与真实兑换校验保持一致，只排除锁定物品（松果本身是牧场产物，不能再按产物标记排除）。
const currencyStock = (items, id) => (items || []).filter(i => String(i.id) === String(id) && !i.locked && !i.is_locked && !i.isLocked).reduce((n, i) => n + BigInt(i.count || 0), 0n);
const canConfig = new Map(CONFIG.MCCanConfig.map(c => [String(c.id), c]));
const bucketId = can => can.feed_type === '有机罐头' ? '7004' : '7003';
function maxGrassRefill(state, facility, policy) {
    if (!facility?.feedMachine || state.sectionErrors?.warehouse) return 0;
    const capacity = Number(facility.capacity);
    const filled = Number(facility.feedMachine.feedCount);
    if (!Number.isSafeInteger(capacity) || capacity <= 0 || !Number.isSafeInteger(filled) || filled < 0) return 0;
    if (filled * 100 >= capacity * policy.grassThresholdPercent) return 0;
    const surplus = stock(state.items, '7001', true) - BigInt(policy.feedReserveCount);
    if (surplus <= 0n) return 0;
    return cap(capacity - filled, policy.feedTargetCount, surplus);
}
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
        if (!Number.isInteger(input.count) || input.count <= 0 || input.count > maxGrassRefill(state, machine, p)) reject();
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
        const benefit = await service.getResource('dailyBenefit', { fresh: decision.readOnly || decision.reason === 'first-enable' });
        if (!enabled('autoDailyBenefit')) return;
        // An ambiguous Purchase leaves this window open for status checks only.
        const result = benefit?.available && !decision.readOnly ? await perform({ action: 'dailyBenefit' }) : null;
        if ((benefit?.claimed === true || result?.reply?.claimed === true) && settings().autoDailyBenefit) {
            benefitSchedule.confirm({ accountId: ctx.accountId, state: decision.state });
        }
    });
    if (enabled('autoAddFeed')) await safely(async () => {
        const facilities = (await service.getStatus()).facilities;
        for (const original of facilities.filter(f => f.feedMachine)) {
            if (!enabled('autoAddFeed')) break;
            const state = await service.getStatus();
            const facility = state.facilities.find(f => String(f.instId) === String(original.instId));
            const count = maxGrassRefill(state, facility, policy());
            if (count > 0) await perform({ action: 'addFeed', facilityInstId: facility.instId, count });
        }
    });
    // 兑换集市：便便(7002)与松果(1008)是两种货币，分开排队、互不阻塞；
    // 开启优先兑换后按保存的顺序依次兑换：前面的商品货币不足就等攒够，不跳过去换后面的。
    if (enabled('autoExchangePoop') || enabled('autoExchangePine')) await safely(async () => {
        const priority = settings().autoExchangePriority === true;
        // 同一商品每轮可连续兑换多次：给每次请求一个本轮唯一的序号，
        // 既避免"同一次巡游里重复提交同一笔"，又让下一轮能继续兑换剩余限额。
        const slice = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const p0 = policy();
        const groups = [
            { key: 'autoExchangePoop', cost: '7002', order: p0.exchangePoopOrder || [], reserve: BigInt(p0.poopReserve || 0) },
            { key: 'autoExchangePine', cost: '1008', order: p0.exchangePineOrder || [], reserve: BigInt(p0.pineReserve || 0) },
        ];
        for (const group of groups) {
            if (!enabled(group.key)) continue;
            const first = (await service.getResource('shop')).exchangeMarket;
            if (!first?.opened || !first.present) continue;
            const goods = (first.goods || []).filter(g => String(g.costItemId) === group.cost);
            if (!goods.length) continue;
            const rank = new Map(group.order.map((id, index) => [String(id), index]));
            const ordered = priority
                ? [...goods].sort((a, b) => (rank.get(String(a.goodsId)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(String(b.goodsId)) ?? Number.MAX_SAFE_INTEGER))
                : goods;
            let waiting = false;
            // 单轮时间预算：连续发车不能长时间占着网关队列，否则背包等读请求会被挤到超时。
            const groupDeadline = Date.now() + 15000;
            for (const target of ordered) {
                if (waiting || !enabled(group.key)) break;
                // 单次请求上限 99，限额更大时连续发车，直到限额用完或货币不足。
                for (let attemptNo = 0; attemptNo < 40; attemptNo++) {
                    if (!enabled(group.key)) return;
                    if (Date.now() > groupDeadline) {
                        waiting = true;
                        break;
                    }
                    const state = await service.getStatus();
                    if (state.sectionErrors?.warehouse) return;
                    const market = (await service.getResource('shop')).exchangeMarket;
                    if (!market?.opened || !market.present) return;
                    const goodsNow = (market.goods || []).find(g => String(g.goodsId) === String(target.goodsId) && String(g.costItemId) === group.cost);
                    if (!goodsNow) break;
                    const price = BigInt(goodsNow.effectiveCostCount || 0);
                    const limit = BigInt(goodsNow.limitCount || 0);
                    const available = limit > 0n ? limit - BigInt(goodsNow.limitUsed || goodsNow.boughtNum || 0) : 99n;
                    if (price <= 0n) break;
                    const balance = currencyStock(state.items, group.cost);
                    const affordable = balance > group.reserve ? (balance - group.reserve) / price : 0n;
                    const count = affordable > 0n ? cap(99, available, affordable) : 0;
                    if (count <= 0) {
                        if (available <= 0n) break;          // 该商品限额已用完，换下一个
                        if (!priority) break;                // 非优先模式：这个商品留到下一轮
                        waiting = true;                      // 优先模式：等货币攒够再兑换
                        break;
                    }
                    const usedBefore = used;
                    try {
                        await perform({ action: 'exchange', goodsId: String(goodsNow.goodsId), count, costCount: String(price), costItemId: group.cost, periodDay: market.periodDay, roundIndex: market.roundIndex, requestIndex: `${slice}:${attemptNo + 1}` }, group.key);
                    } catch (err) { logError(err); break; }
                    // 同一商品多次兑换要各自记账：没有真正发车（去重/开关关闭）时立即停手，避免空转。
                    if (used === usedBefore) break;
                    if (price * BigInt(count) >= balance - group.reserve) break;
                }
            }
        }
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
            const roster = await (ctx.readFriendRoster ? ctx.readFriendRoster() : service.getResource('friends'));
            if (!roster) return; // Saved scan will resume on the next ranch lease.
            const all = roster.friends || [];
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
                const stealAvailable = async shelves => {
                    if (enabled('autoSteal') && (!ctx.maturityPlan || ctx.maturityPlan.canSteal(hostGid))) {
                        for (const shelf of shelves || []) if (shelf.canSteal) await perform({ ...base, action: 'steal', slotIndex: shelf.slotIndex });
                    }
                };
                // Spend this slice on already-available loot before any optional interaction.
                await stealAvailable(ranch.shelves);
                // Production can immediately create stealable shelves. Only consume freshly
                // queried shelves, never infer loot or retry a completed production write.
                let stealRanch;
                if (enabled('autoSteal') && (!ctx.maturityPlan || ctx.maturityPlan.canSteal(hostGid))) {
                    for (const animal of ranch.animals || []) if (animal.canTriggerProduce) {
                        const produced = await perform({ ...base, action: 'friendProduce', animalInstId: animal.animalInstId });
                        if (produced) stealRanch = produced.friend?.ranches?.find(r => String(r.ranchInstId) === String(ranch.ranchInstId)) || { shelves: [] };
                    }
                }
                if (stealRanch) await stealAvailable(stealRanch.shelves);
                if (enabled('autoHelp') && (!ctx.maturityPlan || ctx.maturityPlan.canHelp(hostGid)) && ranch.hazards?.length) await perform({ ...base, action: 'help' });
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
