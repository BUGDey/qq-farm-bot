const { ACTION_SWITCH } = require('./ranch-settings');
const benefitSchedule = require('./ranch-benefit-schedule');
const { selectCub, feedTypes, quietNow, purchasableCubs } = require('./ranch-strategy');
const CONFIG = require('../gameConfig/RanchConfig.json');
// 没有已知好友 GID 时官方 GetAll 会稳定返回 1000020：这是名单缺失而不是故障，
// 自动任务按「本轮跳过」处理，最多每 30 分钟提示一次，避免巡查日志被同一条错误刷屏。
const ROSTER_MISSING_WARN_MS = 30 * 60 * 1000;
let rosterMissingWarnAt = 0;
// 好友拜访失败（未解锁/被拉黑/服务端拒绝）后 30 分钟内不再重复拜访，
// 否则同一批好友会每轮巡查都被重试一遍，把巡检配额全耗在打不开的牧场里。
const FRIEND_ENTRY_RETRY_MS = 30 * 60 * 1000;
const friendRetryAt = new Map();
// 服务端确认「今日次数用尽」后，当天不再排布该好友交互动作；次日上海时区日界自动恢复。
// 只按服务端返回的 remaining_times===0 记录，超时回包不明不记录，避免误停排。
// 状态按 service 实例隔离（每账号一个实例），避免账号之间互相影响。
const INTERACTION_QUOTA_RESET_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
function nextQuotaResetMs(serverMs) {
    const base = Number(serverMs) || Date.now();
    return base + INTERACTION_QUOTA_RESET_MS - ((base + SHANGHAI_OFFSET_MS) % INTERACTION_QUOTA_RESET_MS);
}
function createInteractionQuota() {
    const exhaustedUntil = new Map();
    return {
        remember(action, remaining, serverMs) {
            if (remaining === 0) exhaustedUntil.set(action, nextQuotaResetMs(serverMs));
            else if (remaining > 0) exhaustedUntil.delete(action);
        },
        resetAt(action, nowMs = Date.now()) {
            const reset = exhaustedUntil.get(action);
            if (!reset || reset <= nowMs) { if (reset) exhaustedUntil.delete(action); return 0; }
            return reset;
        },
    };
}
const QUOTA_OP_ACTIONS = { 11003: 'autoPutHazard', 11009: 'autoStroke' };
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
    // 修饰性开关（如「只抚摸勾选的好友」「无机/有机罐头」）不属于某个调度分组，
    // 必须读未按分组过滤的原始设置，否则在 help/feed 分组下会被过滤成 false。
    const rawSettings = typeof ctx.rawSettings === 'function' ? ctx.rawSettings : settings;
    const quota = ctx.interactionQuota || createInteractionQuota();
    const nowMs = () => Number(ctx.now ? ctx.now() : Date.now());
    let used = 0, cancelled = false;
    const alive = () => !cancelled && isAlive();
    const enabled = key => {
        if (settings()[key] && used >= policy().maxActionsPerRun) ctx.onLimit?.();
        // 次数用尽的动作当天不再排队；重置时刻由服务端权威回包确定。
        if (quota.resetAt(key, nowMs())) return false;
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
    // 自动使用罐头：按「无机/有机」两个独立总开关过滤可用罐头，与罐头策略（canStrategy）互不影响。
    const canLanes = [
        { key: 'autoUseCanNormal', feedType: '无机罐头' },
        { key: 'autoUseCanOrganic', feedType: '有机罐头' },
    ].filter(lane => rawSettings()[lane.key]);
    if (enabled('autoUseCan') || canLanes.length) for (const id of policy().canItemIds) await safely(async () => {
        const can = canConfig.get(id);
        if (!can) return;
        const lane = canLanes.find(candidate => candidate.feedType === can.feed_type);
        // 旧的「自动装填罐头容器」总开关优先；它没开时用对应的无机/有机独立开关。
        const key = enabled('autoUseCan') ? 'autoUseCan' : lane && enabled(lane.key) ? lane.key : null;
        if (!key) return;
        const state = await service.getStatus(); const p = policy();
        const item = state.items.find(i => String(i.id) === id && i.canUseCan && !i.locked);
        const surplus = stock(state.items, id, true) - BigInt(p.canReserveCount);
        const gap = BigInt(p.bucketTargetSeconds) - stock(state.items, bucketId(can));
        if (!item || surplus <= 0n || gap < BigInt(can.speed_up_secs)) return;
        const count = cap(item.count, surplus, gap / BigInt(can.speed_up_secs), p.canMaxPerRun);
        // 容器已满（code=1003002）由写入层记录并跳过，不影响后续罐头与其他任务。
        if (count > 0) await perform({ action: 'useCan', itemId: id, uid: item.uid || '0', count }, key);
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
        // 每轮给动物用罐头的次数上限独立可配，默认 1，避免一次巡查把库存罐头全喂完。
        const animalCap = Math.max(1, Math.min(99, Number(policy().feedAnimalMaxPerRun) || 1));
        let fedThisRun = 0;
        const state = await service.getStatus();
        for (const ranch of state.ranches) for (const animal of ranch.animals) {
            for (const bucketType of feedTypes(animal, policy(), (ctx.now || Date.now)())) {
                if (!enabled('autoFeedAnimal') || fedThisRun >= animalCap) break;
                if (stock(state.items, bucketType === 1 ? '7004' : '7003', true) > 0n) {
                    await perform({ action: 'feedAnimal', ranchId: ranch.ranchInstId, animalInstId: animal.animalInstId, bucketType });
                    fedThisRun++;
                }
            }
        }
    });
    // 棚解锁是入栏/生产的前置条件，因此入栏或生产开关也会驱动这一段，否则只开自动入栏时棚永远不会被解锁。
    const shedOptIn = ['autoUpgradeFacilities', 'autoPlace', 'autoProduce'].some(enabled);
    if (enabled('autoUpgradeRanch') || shedOptIn) await safely(async () => {
        // 状态里可能没有 facilities（部分场景只回 ranches），缺失时按「没有设施」处理。
        for (const facility of ((await service.getStatus()).facilities || [])) {
            const key = facility.facilityKind === 'MODULE_TYPE_MAIN_CITY' ? 'autoUpgradeRanch' : 'autoUpgradeFacilities';
            // 待解锁（READY=3）的棚是入栏/生产的前置条件：只要入栏或生产开关开着，
            // 即使没开「解锁棚与升级设施」也要先把棚解锁，否则棚里的自动化永远不会开始。
            const shedKey = ['autoUpgradeFacilities', 'autoPlace', 'autoProduce'].find(candidate => settings()[candidate]);
            if (Number(facility.state) === 3 && facility.facilityKind === 'MODULE_TYPE_RANCH_SHED' && shedKey) {
                await perform({ action: 'activateFacility', facilityInstId: facility.instId }, shedKey);
                continue; // Upgrade from a fresh snapshot on the next scheduler pass.
            }
            if (!enabled(key)) continue;
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
            let roster;
            try {
                roster = await (ctx.readFriendRoster ? ctx.readFriendRoster() : service.getResource('friends'));
            } catch (err) {
                if (!/\bcode=1000020\b/.test(err.message || '')) throw err;
                const at = (ctx.now || Date.now)();
                if (at - rosterMissingWarnAt >= ROSTER_MISSING_WARN_MS) {
                    rosterMissingWarnAt = at;
                    ctx.logError?.(Object.assign(new Error('牧场好友名单为空：请在好友页同步一次好友，之后才会自动巡查好友牧场'), { code: 'ROSTER_EMPTY' }));
                }
                return;
            }
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
            // 拜访失败的牧场先冷却一段时间再试：服务端拒绝（未解锁/非好友/被限制）不会自己恢复，
            // 每轮重试只会白白消耗巡查配额，还会把日志刷满。
            const nowValue = (ctx.now || Date.now)();
            const retryAt = friendRetryAt.get(hostGid) || 0;
            if (nowValue < retryAt) return;
            let visit;
            try {
                visit = await service.action({ action: 'visitFriend', hostGid });
            } catch (err) {
                // 只有「服务端明确拒绝」才冷却这条好友；请求超时/连接中断等结果未知的错误
                // 下一次巡查应当正常重试，不能因为一次抖动就跳过一个好友半小时。
                if (!['REQUEST_TIMEOUT', 'ENCODE_TIMEOUT', 'CONNECTION_CLOSED', 'SCENE_CANCELLED', 'GATEWAY_BUSY', 'AUTOMATION_BUSY'].includes(err.code)) {
                    friendRetryAt.set(hostGid, nowValue + FRIEND_ENTRY_RETRY_MS);
                }
                throw err;
            }
            friendRetryAt.delete(hostGid);
            ctx.maturityPlan?.observe(hostGid, visit.friend?.ranches);
            // 服务端权威次数：用尽的动作当天停排，次日重置后再排队。
            const serverMs = Number(ctx.serverNow ? ctx.serverNow() : Date.now());
            for (const op of visit.friend?.ops || []) {
                const action = QUOTA_OP_ACTIONS[String(op.opId)];
                if (action && /^\d+$/.test(String(op.remainingTimes))) quota.remember(action, Number(op.remainingTimes), serverMs);
            }
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
                // 助产属于好友帮助巡查，不应被「自动偷取」开关绑死。
                // 两个开关都开时沿用偷取任务的写入键；只开帮助时用 autoHelp，
                // 这样关闭偷取后仍能独立执行好友助产。
                const canProduceFriend = enabled('autoSteal') || enabled('autoHelp');
                const produceAllowed = ctx.maturityPlan
                    ? (enabled('autoSteal') ? ctx.maturityPlan.canSteal(hostGid) : ctx.maturityPlan.canHelp(hostGid))
                    : true;
                if (canProduceFriend && produceAllowed) {
                    const produceKey = rawSettings().autoSteal === true ? 'autoSteal' : 'autoHelp';
                    for (const animal of ranch.animals || []) if (animal.canTriggerProduce) {
                        const produced = await perform({ ...base, action: 'friendProduce', animalInstId: animal.animalInstId }, produceKey);
                        if (produced) stealRanch = produced.friend?.ranches?.find(r => String(r.ranchInstId) === String(ranch.ranchInstId)) || { shelves: [] };
                    }
                }
                if (stealRanch) await stealAvailable(stealRanch.shelves);
                if (enabled('autoHelp') && (!ctx.maturityPlan || ctx.maturityPlan.canHelp(hostGid)) && ranch.hazards?.length) await perform({ ...base, action: 'help' });
                if (enabled('autoStroke') && (!ctx.maturityPlan || ctx.maturityPlan.canHelp(hostGid))) {
                    // 「只抚摸勾选的好友」：白名单为空时不抚摸任何人，避免误操作非指定好友。
                    const strokeOnly = rawSettings().autoStrokeSelected === true;
                    const strokeList = current.strokeIncludeGids || [];
                    if (!strokeOnly || strokeList.includes(hostGid)) {
                        for (const animal of ranch.animals || []) if (animal.canStroke) {
                            const stroked = await perform({ ...base, action: 'stroke', animalInstId: animal.animalInstId });
                            // 写后以服务端次数为准；用尽即停排，不再继续抚摸其他动物。
                            const after = stroked?.friend?.ops?.find(op => String(op.opId) === '11009');
                            if (after && /^\d+$/.test(String(after.remainingTimes))) {
                                quota.remember('autoStroke', Number(after.remainingTimes), serverMs);
                                if (quota.resetAt('autoStroke', nowMs())) break;
                            }
                        }
                    }
                }
                if (enabled('autoPutHazard') && hazardsRemaining > 0n && (!ctx.maturityPlan || ctx.maturityPlan.canHelp(hostGid))) {
                    const placed = await perform({ ...base, action: 'putHazard' });
                    hazardsRemaining = hazardQuota(placed?.friend);
                    // 写后再次以服务端剩余次数为准，用尽则当天停排。
                    const after = placed?.friend?.ops?.find(op => String(op.opId) === '11003');
                    if (after && /^\d+$/.test(String(after.remainingTimes))) quota.remember('autoPutHazard', Number(after.remainingTimes), serverMs);
                }
            }
            // Keep the current friend in the continuation until all its safe actions
            // have been considered. Maturity observation must not discard a yielded tail.
            if (alive() && used < policy().maxActionsPerRun) continuation?.friendBatch.completed.add(offset);
        });
    });
}
module.exports = { runRanchExtraAutomation, assertAutomationPolicy, createInteractionQuota, nextQuotaResetMs };
