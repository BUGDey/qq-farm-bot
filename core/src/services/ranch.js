const path = require('node:path');
const { readJsonFile, writeJsonFileAtomic } = require('./json-db');
const { ranchOperationDetails, ranchOperationModule } = require('./ranch-operation-log');
const { ranchLevel, upgradeBlockReason } = require('./ranch-upgrade');
const { createRanchProtocol, ANIMAL_STAGE_LABELS } = require('./ranch-protocol');
const { ranchSession } = require('./ranch-session');
const config = require('../gameConfig/RanchConfig.json');
const { getAnimalVisual, getFacilityVisual } = require('./ranch-visuals');
const { getItemImageById } = require('../config/gameConfig');
const shopConfig = require('../gameConfig/RanchShopConfig.json');
const goodsMap = new Map(shopConfig.MCGoods.map(row => [String(row.id), row]));
const CAPABILITIES = Object.freeze({ connect: false, disconnect: false, claimTask: true, collect: true, clean: true, place: true, produce: true, harvest: true, addFeed: true, submitOrder: true, refreshOrder: true, claimIllustrated: true, claimWeight: true, dailyBenefit: true, buy: true, exchange: true, friendActions: true, sell: true, useCan: true, visitors: true, feedAnimal: true, activateFacility: true, upgradeBuilding: true, completeUpgrade: true, buildingEdit: false, landUnlock: false });
const { SETTINGS_KEYS, ACTION_SWITCH, normalizePolicy, normalizeSettings } = require('./ranch-settings');
const { feedTypes, quietNow, createRanchMaturityPlan } = require('./ranch-strategy');
const { createRanchScheduler, inGroup } = require('./ranch-scheduler');
const { createRanchDailyBenefit } = require('./ranch-daily-benefit');
const benefitSchedule = require('./ranch-benefit-schedule');
const { runRanchExtraAutomation, assertAutomationPolicy } = require('./ranch-automation');
const itemMap = new Map(config.MCItemInfo.map(row => [String(row.id), row]));
const animalIcons = require('../gameConfig/RanchAnimalIcons.json');
const ranchItemImage = id => animalIcons[String(id)]?.[1] || (String(id) === '7002' ? '/game-config/ranch-icons/poop.png' : getItemImageById(id));
const SHOP_RESOURCE_IDS = [1007, 1008, 1002, 1004, 7002];
const ANIMAL_PHASE_DURATION_FIELDS = Object.freeze({ 1: 'infant_sec', 2: 'grow_sec', 3: 'product_round_sec', 4: 'mature_sec' });
const animalMap = new Map(config.MCAnimalConfig.map(row => [String(row.id), row]));
const facilityMap = new Map(config.MCFacilityConfig.map(row => [String(row.facility_id), row]));
const ACTION_NAMES = Object.freeze({ claimTask: '领取牧场任务奖励', visitFriend: '查看好友牧场', steal: '偷取好友产物', friendProduce: '帮好友生产', help: '帮助清理', stroke: '照料好友动物', putHazard: '放蚊子', sell: '出售牧场产物', useCan: '装填罐头', collect: '收集产物', clean: '清理灾害', place: '放入幼崽', produce: '开始生产', harvest: '收获动物', addFeed: '补充牧草', submitOrder: '提交订单', refreshOrder: '刷新订单', claimIllustrated: '图鉴领奖', claimWeight: '重量积分领奖', dailyBenefit: '领取每日福利', buy: '购买商品', exchange: '兑换商品', feedAnimal: '使用罐头容器', activateFacility: '解锁棚', upgradeBuilding: '升级设施', completeUpgrade: '完成设施升级' });
const camel = key => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
function camelize(value) {
    if (Array.isArray(value)) return value.map(camelize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [camel(key), camelize(v)]));
}
function describeResource(raw) {
    const value = camelize(raw);
    function visit(node) {
        if (Array.isArray(node)) return node.map(visit);
        if (!node || typeof node !== 'object') return node;
        const result = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, visit(v)]));
        const id = result.itemId ?? result.fruitId ?? (result.count != null ? result.id : undefined);
        if (id != null) { result.name = itemMap.get(String(id))?.name || animalMap.get(String(id))?.name || `物品 ${id}`; result.image = ranchItemImage(id); }
        if (result.costItemId != null) result.costItemName = itemMap.get(String(result.costItemId))?.name || `物品 ${result.costItemId}`;
        return result;
    }
    return visit(value);
}
const positiveDecimal = value => (typeof value === 'string' || Number.isSafeInteger(value)) && /^[1-9]\d*$/.test(String(value));
// Canonicalize rewards by item ID so row order and split entries do not affect equality.
function saleRewards(rows, multiplier = 1n) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const totals = new Map();
    for (const row of rows) {
        if (!positiveDecimal(row?.id) || !positiveDecimal(row?.count)) return [];
        const id = String(row.id);
        totals.set(id, (totals.get(id) || 0n) + BigInt(row.count) * multiplier);
    }
    return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([id, count]) => ({ id, count: String(count) }));
}
function normalizeItem(raw, physical = false, verifiedRanchBag = false) {
    const item = camelize(raw);
    const row = itemMap.get(String(item.id));
    const ids = row?.show_tab_ids;
    const locked = !!(item.isLocked || item.locked);
    const unconditional = !row?.sell_cond && !row?.cond_sells
        && !item.show?.sellCond?.length && !item.show?.condSells?.length;
    const canSell = physical === true && !locked && unconditional && [106, 107].includes(row?.type);
    // A manual sale requires a server quote for an exact physical lot; never infer a price from config.
    const manualSellPrices = physical === true && verifiedRanchBag && !locked && unconditional && positiveDecimal(item.id)
        && positiveDecimal(item.uid) && positiveDecimal(item.count)
        ? describeResource(saleRewards(item.show?.sells)) : [];
    return { ...item, image: getItemImageById(item.id), locked, detail: item.itemDetail || item.detail, name: row?.name || `物品 ${item.id}`, type: row?.type ?? null,
        canUseCan: !locked && config.MCCanConfig.some(c => String(c.id) === String(item.id)),
        canSell, manualSellPrices,
        tabIds: ids == null ? [] : Array.isArray(ids) ? ids.map(Number) : String(ids).split(/[;,]/).map(Number).filter(Number.isFinite) };
}
function normalizeSnapshot({ cells, ranches, bag, tabs, order, orderError, serverTime, settings, farmLevel }) {
    const facilities = (cells.facilities || []).map(raw => {
        const value = camelize(raw); const row = facilityMap.get(String(raw.facility_id));
        const next = facilityMap.get(String(row?.next_facility_id));
        const nextUpgradeCost = String(next?.upgrade_cost || '').split(';').filter(Boolean).map(v => { const [id, count] = v.split(':'); return { id, count, name: itemMap.get(id)?.name || `物品 ${id}` }; });
        return { ...value, visual: getFacilityVisual(row), facilityKind: row?.module_type, instId: value.instanceId, name: row?.name || `设施 ${value.facilityId}`, nextLevel: next?.level, nextUpgradeCost, nextUpgradeSeconds: next?.upgrade_secs, nextUpgradeConditions: next?.upgrade_conditions };
    });
    const items = [...(bag.physical_items || []).map(item => normalizeItem(item, true, bag.global_scene_id === 2)), ...(bag.virtual_items || []).map(item => normalizeItem(item))];
    const unlockedCount = id => items.filter(i => String(i.id) === String(id) && !i.locked && !i.detail?.ranchProduct).reduce((total, i) => total + BigInt(i.count || 0), 0n);
    const normalizedRanches = ranches.map(raw => {
        const value = camelize(raw);
        const facility = facilities.find(f => String(f.ranch?.ranchInstId) === String(value.ranchInstId));
        return { ...value, availableCubs: config.MCAnimalConfig.filter(a => a.enable_flag === true && (value.husbandryType === 1 ? a.husbandry_type === '窝' : value.husbandryType === 2 ? a.husbandry_type === '棚' : false)).map(a => ({ itemId: a.cub_item_id, animalId: a.id, name: a.name, count: String(unlockedCount(a.cub_item_id)) })), name: facility?.name || `窝棚 ${value.ranchInstId}`,
            animals: (value.animals || []).map(a => ({ ...a, image: animalIcons[String(a.animalId)]?.[a.stage === 1 ? 1 : 4] || '', phaseDurationMs: Number(animalMap.get(String(a.animalId))?.[ANIMAL_PHASE_DURATION_FIELDS[a.stage]] || 0) * 1000, visual: getAnimalVisual(a.animalId, a.stage, a.mutation), stageLabel: ANIMAL_STAGE_LABELS[a.stage] || '未知', canTriggerProduce: a.stage === 3 && !a.producing && a.canDeliver === true, name: animalMap.get(String(a.animalId))?.name || `动物 ${a.animalId}` })),
            shelves: (value.shelves || []).map(s => ({ ...s, lots: (s.lots || []).map(lot => ({ ...lot, name: itemMap.get(String(lot.itemId))?.name || `物品 ${lot.itemId}` })) })),
        };
    });
    const upgradeState = { items, ranchLevel: ranchLevel(items) };
    for (const facility of facilities) facility.upgradeBlockedReason = upgradeBlockReason(facility, upgradeState, farmLevel);
    return {
        ranchLevel: upgradeState.ranchLevel,
        sceneReady: true, sessionState: 'parallel', serverTime, syncedAt: Date.now(), settings, capabilities: CAPABILITIES,
        grid: { width: cells.grid_width, height: cells.grid_height }, ranches: normalizedRanches,
        facilities, buildingItems: (cells.building_items || []).map(raw => ({ ...camelize(raw), name: facilityMap.get(String(raw.facility_id))?.name || `建筑 ${raw.facility_id}` })),
        items, tabs: (tabs.tabs || []).map(tab => ({ id: tab.tab_id, name: tab.tab_name, count: tab.item_count })),
        currencies: [1007, 1008].map(id => ({ id, name: itemMap.get(String(id))?.name, count: items.find(i => String(i.id) === String(id))?.count ?? '0' })),
        orders: (order?.panel?.slots || []).map(slot => ({ ...camelize(slot), id: slot.instance_id, name: `订单 ${slot.slot_index + 1}`, canSubmit: !!slot.instance_id && slot.submit_state === 1 && Number(order.panel.submit_quota) > 0, canRefresh: !!slot.instance_id && Number(order.panel.refresh_quota) > 0, statusLabel: slot.submit_state === 1 ? '材料已备齐，可提交' : slot.submit_state === 2 ? '材料不足' : '暂不可提交', requirements: (slot.req_items || []).map(normalizeItem), rewards: (slot.reward_items || []).map(normalizeItem) })),
        orderPanel: order?.panel ? camelize(order.panel) : null, ordersError: orderError || null,
    };
}
function createRanchService({ rpc, send, session = ranchSession, getUserState, getSettings = () => ({}), log = () => {}, now = Date.now, serverNow = now, getKnownFriendGids = () => require('../models/store').getKnownFriendGids(), getPlatform = () => require('../config/config').CONFIG.platform } = {}) {
    const scheduler = createRanchScheduler({ now });
    let operation = 0;
    let automationRunning = false;
    const continuations = new Map();
    const friendCursors = { all: 0, farm: 0, help: 0, steal: 0 };
    const maturityPlan = createRanchMaturityPlan(now);
    let planEpoch;
    const settings = () => normalizeSettings(getSettings());
    const observeDisabledDailyBenefit = () => {
        const accountId = getUserState().gid;
        if (accountId && !settings().autoDailyBenefit) benefitSchedule.observeDisabled({ accountId, now: now() });
    };
    const scheduledSettings = () => {
        const result = settings();
        if (quietNow(normalizePolicy(getSettings().ranch_policy), now())) {
            for (const key of ['autoHelp', 'autoStroke', 'autoPutHazard', 'autoSteal']) result[key] = false;
        }
        return result;
    };
    const operations = {};
    // 与农场 stats.js 的统计逻辑一致：今日计数跨天清零，全期累计（operationsTotal）
    // 跨天/重启均永久保留，并持久化到 data/stats/ranch-<accountId>.json。
    // 测试环境未设置 FARM_ACCOUNT_ID 时自动跳过磁盘读写，仅保留内存累计。
    const totalOperations = {};
    let totalOperationsLoaded = false;
    let totalOperationsSaveTimer = null;
    const totalStatsFile = () => {
        const accountId = String(process.env.FARM_ACCOUNT_ID || '').trim();
        if (!accountId) return null;
        const baseDir = process.env.FARM_DATA_DIR || path.join(__dirname, '../../data');
        return path.join(baseDir, 'stats', `ranch-${accountId}.json`);
    };
    function loadTotalOperations() {
        if (totalOperationsLoaded) return;
        totalOperationsLoaded = true;
        const file = totalStatsFile();
        if (!file) return;
        const persisted = readJsonFile(file, null);
        const saved = persisted && typeof persisted.totalOperations === 'object' ? persisted.totalOperations : {};
        for (const key of Object.keys(saved)) totalOperations[key] = Number(saved[key]) || 0;
    }
    function scheduleTotalSave() {
        if (totalOperationsSaveTimer || !totalStatsFile()) return;
        totalOperationsSaveTimer = setTimeout(() => {
            totalOperationsSaveTimer = null;
            const file = totalStatsFile();
            if (!file) return;
            try { writeJsonFileAtomic(file, { totalOperations: { ...totalOperations }, savedAt: Date.now() }); } catch { }
        }, 2000);
    }
    const dailyBenefitCache = { day: '', at: 0, state: null };
    const dayKey = () => new Date(now() + 8 * 3600000).toISOString().slice(0, 10);
    let operationsDate = dayKey();
    function syncOperationsDay() {
        if (operationsDate !== dayKey()) {
            for (const key of Object.keys(operations)) delete operations[key];
            operationsDate = dayKey();
        }
    }
    // Statistics must remain readable without a scene switch or inventory RPC.
    function getOperationStats() {
        syncOperationsDay();
        loadTotalOperations();
        return { operations: { ...operations }, operationsDate, operationsTotal: { ...totalOperations } };
    }
    let lastAutomationAt = null;
    let lastPatrolSummaryAt = -Infinity;
    function patrolSummary(result, reason) {
        if (now() - lastPatrolSummaryAt < 60000) return;
        lastPatrolSummaryAt = now();
        log('牧场', `自动巡查${result}：${reason}（无可执行动作时不增加操作计数）`, {
            scene: 'ranch', module: 'ranch', event: 'patrol', trigger: 'automatic', result: 'info', reason,
        });
    }
    function details(input, reply, context = {}) {
        return ranchOperationDetails(input, reply, { itemName: id => itemMap.get(String(id))?.name || animalMap.get(String(id))?.name || `物品 ${id}`, goodsItem: goodsMap.get(String(input.goodsId))?.item_id, ...context });
    }
    function record(action, reply, trigger = 'manual', input = {}, context = {}) {
        syncOperationsDay();
        operations[action] = (operations[action] || 0) + 1;
        loadTotalOperations();
        totalOperations[action] = (totalOperations[action] || 0) + 1;
        scheduleTotalSave();
        const detail = details(input, reply, context);
        log('牧场', `${trigger === 'automatic' ? '自动' : '手动'}${ACTION_NAMES[action] || action}成功${detail.text ? `：${detail.text}` : ''}`, { scene: 'ranch', module: ranchOperationModule(action), event: action, trigger, result: 'ok', resultCount: reply?.op_results?.length ?? null, ...detail.meta });
    }
    async function exclusive(fn) {
        return session.inRanch(async () => {
            // Count only work holding the lease. Queued reads/writes must not veto
            // automation already waiting its turn on this same serial executor.
            operation++;
            try {
                session.assertAllowed();
                if (!getUserState().gid) throw new Error('账号尚未登录');
                if (pendingLeave && pendingLeaveEpoch !== session.getEpoch?.()) pendingLeave = null;
                if (pendingLeave) await leaveFriend(pendingLeave);
                return await fn();
            } finally { operation--; }
        });
    }
    async function snapshot(strict = true, light = false) {
        const errors = {};
        async function read(section, method, params, fallback) {
            try { return await rpc(method, params); }
            catch (err) {
                if (strict) throw err;
                errors[section] = err.message;
                return fallback;
            }
        }
        const cells = await read('buildings', 'AllCells', {}, { facilities: [] });
        const ids = (cells.facilities || []).filter(f => f.ranch).map(f => f.ranch.ranch_inst_id);
        // Only query own facilities. No guessed global IDs or friend operations.
        const ranches = ids.length ? (await read('overview', 'GetRanchDetail', { host_gid: String(getUserState().gid), ranch_inst_ids: ids }, { ranches: [] })).ranches : [];
        const bag = await read('warehouse', 'GetBag', { global_scene_id: 2, tab_id: 0 }, {});
        const tabs = light ? {} : await read('tabs', 'GetBagTab', { global_scene_id: 2 }, {});
        let order, orderError;
        try { if (!light || settings().autoSubmitOrders) order = await rpc('GetOrderPanel', {}); } catch (err) { orderError = err.message; }
        if (errors.buildings) errors.overview = `设施读取失败：${errors.buildings}`;
        const state = normalizeSnapshot({ cells, ranches: ranches || [], bag, tabs, order, orderError, serverTime: serverNow(), settings: settings(), farmLevel: getUserState().level });
        if (!light) {
            try { state.tasks = await readTasks(); }
            catch (err) { errors.tasks = err.message; }
        }
        state.sectionErrors = errors;
        syncOperationsDay();
        loadTotalOperations();
        Object.assign(state, getOperationStats());
        state.lastAutomationAt = lastAutomationAt;
        state.nextChecks = scheduler.status(scheduledSettings(), normalizePolicy(getSettings().ranch_policy));
        state.capabilities = CAPABILITIES;
        if (errors.warehouse) state.currencies = [];
        return state;
    }
    // Compatibility endpoints remain reads; scene acquisition is centralized in the account executor.
    async function connect() { return getStatus(); }
    async function disconnect() { return getStatus(); }
    async function getStatus() {
        if (!getUserState().gid) throw new Error('账号尚未登录');
        return exclusive(() => session.inRanch(() => snapshot(false)));
    }
    // Visit state is scoped to one queued transaction; never leave a friend visit open for the web UI.
    let pendingLeave = null;
    let pendingLeaveEpoch;
    async function leaveFriend(host) {
        await rpc('LeaveHomestead', { host_gid: host });
        pendingLeave = null;
    }
    async function readTasks() {
        const reply = await rpc('TaskInfo', { global_scene_id: 2 });
        if (!reply?.task_info) throw new Error('牧场任务响应缺少 task_info');
        const info = reply.task_info;
        const rows = info.tasks?.length ? info.tasks : [...(info.growth_tasks || []), ...(info.daily_tasks || [])];
        return [...new Map(rows.filter(t => [4, 5, 6].includes(Number(t.task_type))).map(t => [String(t.id), describeResource(t)])).values()];
    }
    const QQ_RANCH_FRIEND_BATCH_SIZE = 35;
    const FRIEND_DETAILS_CACHE_TTL_MS = 30 * 1000;
    let friendDetailsCache;
    async function readFriends({ scan, checkpoint = () => true, host } = {}) {
        const self = String(getUserState().gid);
        const epoch = session.getEpoch?.();
        const platform = getPlatform();
        const validGid = gid => positiveDecimal(gid) && String(gid) !== self;
        // Saved farm GIDs are lookup hints only, never evidence of ranch access.
        const seeds = platform === 'qq' ? [...new Set((getKnownFriendGids() || []).filter(validGid).map(String))] : [];
        const key = JSON.stringify([epoch, self, platform, seeds]);
        const assertRosterScope = () => {
            session.assertAllowed();
            if (epoch !== session.getEpoch?.() || self !== String(getUserState().gid) || platform !== getPlatform()) {
                throw Object.assign(new Error('牧场好友同步期间登录状态已变化'), { code: 'SCENE_CANCELLED' });
            }
        };
        assertRosterScope();
        if (host && !validGid(host)) return { friends: [] };
        let current = scan?.current?.key === key ? scan.current : null;
        if (!current) {
            if (!checkpoint(false)) return null;
            let all;
            try {
                all = await rpc('GetAll', { global_scene_id: 2 });
            } catch (err) {
                // Only the known QQ legacy endpoint rejection can fall back.
                if (!seeds.length || !/\bcode=1000020\b/.test(err.message || '')) throw err;
                all = {};
            }
            assertRosterScope();
            const blockedPlayers = all.blocked_players || [];
            const blocked = new Set([...blockedPlayers, ...(all.blocked_by_players || [])].map(f => String(f.gid)));
            const direct = new Map();
            const collect = (into, rows, requested) => {
                for (const row of rows) {
                    const gid = String(row.gid);
                    if (validGid(row.gid) && row.big_farm_status && !row.is_banned && !blocked.has(gid) && (!requested || requested.has(gid))) {
                        into.set(gid, { ...row, gid, name: row.name?.trim() || row.remark?.trim() || `GID:${gid}` });
                    }
                }
            };
            collect(direct, all.game_friends || []);
            if (direct.size || !seeds.length) return { friends: [...direct.values()], blocked_players: blockedPlayers };
            const gids = seeds.filter(gid => !blocked.has(gid));
            if (host && !gids.includes(host)) return { friends: [], blocked_players: blockedPlayers };
            if (!host && friendDetailsCache?.key === key && now() - friendDetailsCache.at < FRIEND_DETAILS_CACHE_TTL_MS) {
                const details = new Map();
                collect(details, friendDetailsCache.friends);
                return { friends: [...details.values()], blocked_players: blockedPlayers };
            }
            current = { key, gids: host ? [host] : gids, offset: 0, friends: new Map(), blockedPlayers, collect };
            if (scan) scan.current = current;
            if (current.gids.length && !checkpoint(true)) return null;
        }
        while (current.offset < current.gids.length) {
            if (!checkpoint(false)) return null;
            const batch = current.gids.slice(current.offset, current.offset + QQ_RANCH_FRIEND_BATCH_SIZE);
            const reply = await rpc('GetGameFriends', { friend_gids: batch, global_scene_id: 2 });
            assertRosterScope();
            current.collect(current.friends, reply.friends || [], new Set(batch));
            current.offset += batch.length;
            if (current.offset < current.gids.length && !checkpoint(true)) return null;
        }
        const friends = [...current.friends.values()];
        if (!host) friendDetailsCache = { key, friends, at: now() };
        if (scan) scan.current = null;
        return { friends, blocked_players: current.blockedPlayers };
    }
    async function friendAction(input, mutate, trigger) {
        const host = String(input.hostGid || '');
        if (!/^[1-9]\d*$/.test(host) || host === String(getUserState().gid)) throw new Error('无效好友牧场');
        const all = await readFriends({ host });
        const officialFriend = all.friends.find(f => String(f.gid) === host);
        if (!officialFriend) throw new Error('目标不是可访问的好友');
        const visitEpoch = session.getEpoch?.();
        const entered = await rpc('EnterHomestead', { host_gid: host, reason: 2 });
        pendingLeave = host;
        pendingLeaveEpoch = visitEpoch;
        let result, actionError;
        try {
            const cells = entered.homestead_cells || await rpc('AllCells', {});
            const ids = (cells.facilities || []).filter(f => f.ranch).map(f => f.ranch.ranch_inst_id);
            // Facilities of the visited home (incl. feed machine) for guest-side actions like AddFeed.
            const friendFacilities = normalizeSnapshot({ cells, ranches: [], bag: {}, tabs: {}, settings: settings() }).facilities;
            const load = async () => ids.length ? (await rpc('GetRanchDetail', { host_gid: host, ranch_inst_ids: ids })).ranches || [] : [];
            let ranches = await load();
            let ops = (await rpc('GetRanchOpTimes', {})).ops || [];
            const ranch = ranches.find(r => String(r.ranch_inst_id) === String(input.ranchId));
            const remaining = id => BigInt(ops.find(o => String(o.op_id) === id)?.remaining_times || 0);
            let reply;
            const isVisit = input.action === 'visitFriend';
            if (!isVisit) {
                if (!ranch && input.action !== 'addFeed') throw new Error('好友栏舍已不存在，请重新查看');
                if (input.action === 'friendProduce') {
                    const animal = (ranch.animals || []).find(a => String(a.animal_inst_id) === String(input.animalInstId));
                    if (!animal || animal.stage !== 3 || animal.producing || animal.can_deliver !== true) throw new Error('好友动物当前不可生产');
                    reply = await mutate('TriggerProduce', { host_gid: host, targets: [{ ranch_inst_id: String(ranch.ranch_inst_id), animal_inst_id: animal.animal_inst_id }] });
                } else if (input.action === 'steal') {
                    const shelf = (ranch.shelves || []).find(v => v.slot_index === input.slotIndex && v.can_steal);
                    if (!shelf) throw new Error('该货架当前不可偷取');
                    reply = await mutate('StealProduce', { host_gid: host, targets: [{ ranch_inst_id: String(ranch.ranch_inst_id), slot_index: shelf.slot_index }] });
                } else if (input.action === 'help') {
                    if (!(ranch.hazards || []).length) throw new Error('该栏舍当前没有可清理的灾害');
                    reply = await mutate('CleanAllRanch', { host_gid: host, ranch_inst_ids: [String(ranch.ranch_inst_id)] });
                } else if (input.action === 'stroke') {
                    const animal = (ranch.animals || []).find(a => String(a.animal_inst_id) === String(input.animalInstId));
                    if (!animal?.mutation?.strokable || Number(animal.mutation.mutation_type || 0) !== 0 || (animal.mutation.stroked_gids || []).some(g => String(g) === String(getUserState().gid))) throw new Error('该动物当前不可照料或已照料');
                    if (remaining('11009') <= 0n) throw new Error('今日照料次数已用尽或未取得限额');
                    reply = await mutate('StrokeAnimal', { host_gid: host, target: { ranch_inst_id: String(ranch.ranch_inst_id), animal_inst_id: animal.animal_inst_id } });
                } else if (input.action === 'putHazard') {
                    if (remaining('11003') <= 0n) throw new Error('今日放蚊子次数已用尽或未取得限额');
                    reply = await mutate('PutHazard', { host_gid: host, ranch_inst_id: String(ranch.ranch_inst_id), op_id: '11003', count: '1' });
                } else if (input.action === 'addFeed') {
                    // Guest-side AddFeed (HAR seq268): f1=instance_id, f2=add_count, f4=host_gid.
                    const facility = friendFacilities.find(f => String(f.instId) === String(input.facilityInstId) && !!f.feedMachine);
                    if (!facility) throw new Error('好友牧草机不存在或已变动，请刷新后重试');
                    const count = input.count;
                    if (!Number.isInteger(count) || count <= 0 || count > 2147483647) throw new Error('牧草数量必须为正整数');
                    const capacity = Number(facility.capacity);
                    if (!(capacity > 0) || count > capacity - Number(facility.feedMachine.feedCount)) throw new Error('好友牧草机剩余容量不足');
                    reply = await mutate('AddFeed', { instance_id: String(facility.instId), add_count: count, use_gold: false, host_gid: host });
                }
                const nickname = String(entered.basic?.name || '').trim();
                record(input.action, reply, trigger, input, { state: normalizeSnapshot({ cells, ranches, bag: {}, tabs: {}, settings: settings() }), friendName: nickname || all.friends.find(f => String(f.gid) === host)?.name });
                // Never reclassify a completed mutation as failed if a subsequent read fails.
                try { ranches = await load(); ops = (await rpc('GetRanchOpTimes', {})).ops || []; }
                catch (err) { result = { refreshError: err.message }; ranches = []; ops = []; }
            }
            const snapshot = normalizeSnapshot({ cells, ranches, bag: {}, tabs: {}, settings: settings() });
            result = { ...result, action: input.action, reply: describeResource(reply), friend: { hostGid: host, facilities: snapshot.facilities, ranches: snapshot.ranches.map(r => ({ ...r, animals: r.animals.map(a => ({ ...a, canStroke: !!a.mutation?.strokable && Number(a.mutation.mutationType || 0) === 0 && !(a.mutation.strokedGids || []).some(g => String(g) === String(getUserState().gid)) && remaining('11009') > 0n })) })), ops: camelize(ops) } };
        } catch (err) { actionError = err; }
        try { await leaveFriend(host); }
        catch (err) {
            log('牧场', `退出好友牧场失败：${err.message}`, { scene: 'ranch', module: ranchOperationModule('leaveFriend'), event: 'leaveFriend', result: 'error' });
            if (!actionError) result = { ...result, warning: '操作已完成，但退出好友牧场失败；后续请求将先重试退出，请勿重复操作。' };
        }
        if (actionError) throw actionError;
        return result;
    }
    async function action(input, automationKey = null) {
        const trigger = automationKey ? 'automatic' : 'manual';
        const manualSale = input.action === 'sell' && !automationKey && input.items === undefined;
        const saleAccountId = manualSale ? String(getUserState().gid) : null;
        return exclusive(() => session.inRanch(async () => {
            const autoContext = {};
            const check = () => {
                if (!automationKey) return;
                if (['steal', 'friendProduce', 'help', 'stroke', 'putHazard'].includes(input.action) && quietNow(normalizePolicy(getSettings().ranch_policy), now())) throw new Error('当前处于好友静默时段');
                const upgradeKey = ['activateFacility', 'upgradeBuilding', 'completeUpgrade'].includes(input.action) && ['autoUpgradeRanch', 'autoUpgradeFacilities'].includes(automationKey);
                if (upgradeKey) {
                    const facility = autoContext.state?.facilities.find(f => String(f.instId) === String(input.facilityInstId));
                    if (!facility || (facility.facilityKind === 'MODULE_TYPE_MAIN_CITY') !== (automationKey === 'autoUpgradeRanch')) throw new Error('升级开关与建筑类型不符');
                }
                const exchangeKey = input.action === 'exchange' && ['autoExchangePoop', 'autoExchangePine'].includes(automationKey);
                if ((exchangeKey ? (input.costItemId !== (automationKey === 'autoExchangePoop' ? '7002' : '1008')) : (!upgradeKey && ACTION_SWITCH[input.action] !== automationKey)) || !settings()[automationKey]) throw new Error('牧场自动任务已关闭');
                autoContext.simpleExchange = exchangeKey;
                if (input.action === 'feedAnimal') {
                    const p = normalizePolicy(getSettings().ranch_policy);
                    const animal = autoContext.state?.ranches.find(r => String(r.ranchInstId) === String(input.ranchId))?.animals.find(a => String(a.animalInstId) === String(input.animalInstId));
                    if (!animal || !feedTypes(animal, p, now()).includes(input.bucketType)) throw new Error('罐头策略已变化');
                }
                autoContext.exchangeEnabled = settings().autoExchange;
                assertAutomationPolicy(input, normalizePolicy(getSettings().ranch_policy), autoContext);
            };
            const mutate = async (method, params) => { check(); return rpc(method, params); };
            if (automationKey && !settings()[automationKey]) return { skipped: true };
            if (input.action === 'dailyBenefit') {
                // 每日福利走官方 mallpb 商城（slot_type=6），不在 ranchbridge 的 rpc 表里。
                if (!send) throw new Error('牧场每日福利缺少网络发送器');
                const accountId = getUserState().gid;
                const reply = await createRanchDailyBenefit({ send }).claim(now(), { beforePurchase: () => {
                    session.assertAllowed();
                    if (!getUserState().gid || getUserState().gid !== accountId) throw new Error('牧场账号已变化');
                    if (automationKey) {
                        observeDisabledDailyBenefit();
                        check();
                        if (!benefitSchedule.markAttempt({ accountId, now: now() })) throw new Error('无法记录本次自动领取，已停止提交');
                    }
                    dailyBenefitCache.state = null;
                } });
                dailyBenefitCache.day = dayKey();
                dailyBenefitCache.at = now();
                dailyBenefitCache.state = reply;
                record(input.action, reply, trigger, input, { state: autoContext.state });
                return { reply };
            }
            // A feed action carrying someone else's gid is a guest-side AddFeed on their machine.
            const isFriendFeed = input.action === 'addFeed' && /^[1-9]\d*$/.test(String(input.hostGid || '')) && String(input.hostGid) !== String(getUserState().gid);
            if (['visitFriend', 'steal', 'friendProduce', 'help', 'stroke', 'putHazard'].includes(input.action) || isFriendFeed) {
                if (automationKey) check();
                return friendAction(input, mutate, trigger);
            }
            if (input.action === 'exchange') {
                if (!Number.isSafeInteger(input.count) || input.count <= 0 || input.count > 99) throw new Error('兑换数量必须为 1 至 99 的整数');
                const shop = await rpc('RotationShopInfo', { shop_id: 7 });
                if (!shop.opened || !shop.present) throw new Error('仓鼠驿站当前未营业');
                if (String(input.periodDay) !== String(shop.period_day) || input.roundIndex !== shop.round_index) throw new Error('商品轮次已更新，请刷新后重新确认');
                const goods = (shop.goods || []).find(g => String(g.goods_id) === String(input.goodsId));
                if (!goods) throw new Error('兑换商品已下架');
                if (!['7002', '1008'].includes(String(goods.cost_item_id))) throw new Error('该兑换使用未开放的付费资源');
                for (const cond of goods.buy_conds || []) {
                    if (cond.type !== '最低等级' || !/^\d+$/.test(String(cond.params))) throw new Error('兑换条件尚未确认，暂不兑换');
                    if (Number(getUserState().level) < Number(cond.params)) throw new Error('账号等级未达到兑换条件');
                }
                if (Number(goods.limit_count) > 0 && BigInt(goods.limit_used || 0) + BigInt(input.count) > BigInt(goods.limit_count)) throw new Error('超过剩余兑换限额');
                const seconds = now() / 1000;
                const discounted = Number(goods.discount_price) > 0 && seconds >= Number(goods.discount_start_time) && seconds < Number(goods.discount_end_time);
                const price = String(discounted ? goods.discount_price : goods.cost_count);
                if (!/^\d+$/.test(price) || String(input.costCount) !== price || String(input.costItemId) !== String(goods.cost_item_id)) throw new Error('兑换价格已变动，请刷新后重新确认');
                const bag = await rpc('GetBag', { global_scene_id: 2, tab_id: 0 });
                const balance = [...(bag.physical_items || []), ...(bag.virtual_items || [])].filter(i => String(i.id) === String(goods.cost_item_id) && !i.locked && !i.is_locked).reduce((n, i) => n + BigInt(i.count || 0), 0n);
                if (balance < BigInt(price) * BigInt(input.count)) throw new Error('兑换物品余额不足');
                autoContext.market = { balance, itemId: String(goods.item_id), itemCount: Number(goods.item_count), price: BigInt(price), costItemId: String(goods.cost_item_id), bag };
                const reply = await mutate('RotationBuyGoods', { goods_id: String(goods.goods_id), count: input.count, period_day: String(shop.period_day), round_index: shop.round_index });
                record(input.action, reply, trigger, input, { state: autoContext.state });
                return { reply: describeResource(reply) };
            }
            if (input.action === 'buy') {
                const row = goodsMap.get(String(input.goodsId));
                if (!row || ![5, 6].includes(row.shop_id)) throw new Error('商品不属于牧场商店');
                if (row.price_id !== 1007) throw new Error('只支持金券购买，其他付费资源不开放');
                if (!Number.isSafeInteger(input.count) || input.count <= 0 || input.count > Math.min(row.one_buy_count || 99, 999)) throw new Error('购买数量超过单次上限');
                const shop = await rpc('ShopInfo', { shop_id: row.shop_id });
                const goods = (shop.goods_list || []).find(g => String(g.id) === String(input.goodsId));
                if (!goods || !goods.unlocked || goods.owned) throw new Error('商品尚未解锁、已拥有或已下架');
                if (Number(goods.limit_count) > 0 && BigInt(goods.bought_num || 0) + BigInt(input.count) > BigInt(goods.limit_count)) throw new Error('超过剩余购买限额');
                const price = String(goods.price);
                if (!/^\d+$/.test(price) || String(input.price) !== price) throw new Error('商品价格已变动，请刷新后重新确认');
                // Reject active discounts until their BuyGoods price contract is confirmed.
                const second = now() / 1000;
                if (Number(goods.discount_price) > 0 && second >= Number(goods.discount_start_time) && second < Number(goods.discount_end_time)) throw new Error('限时折扣价格语义待确认，暂不购买');
                const bag = await rpc('GetBag', { global_scene_id: 2, tab_id: 0 });
                const balance = [...(bag.physical_items || []), ...(bag.virtual_items || [])].filter(i => String(i.id) === '1007' && !i.locked && !i.is_locked).reduce((n, i) => n + BigInt(i.count || 0), 0n);
                if (balance < BigInt(price) * BigInt(input.count)) throw new Error('金券不足');
                autoContext.market = { balance, itemId: String(row.item_id), itemCount: Number(row.item_count), price: BigInt(price), costItemId: '1007', bag };
                const reply = await mutate('BuyGoods', { goods_id: String(goods.id), num: String(input.count), price, auto_add: false });
                record(input.action, reply, trigger, input, { state: autoContext.state });
                return { reply: describeResource(reply) };
            }
            if (input.action === 'claimTask') {
                if (typeof input.taskId !== 'string' || !/^[1-9]\d{0,18}$/.test(input.taskId)) throw new Error('无效牧场任务 ID');
                // Always re-read the ranch scene: never trust page data or farm task IDs.
                const task = (await readTasks()).find(t => String(t.id) === input.taskId);
                if (!task || ![4, 5].includes(Number(task.taskType)) || !task.isUnlocked || task.isClaimed ||
                    BigInt(task.totalProgress || 0) <= 0n || BigInt(task.progress || 0) < BigInt(task.totalProgress)) {
                    throw new Error('牧场任务未完成、未解锁或已领取');
                }
                // Match farm task.doClaim: shared reward is selected from live shareMultiple.
                // Ranch daily tasks retain the official batch RPC (no shared flag).
                const doShared = Number(task.shareMultiple) > 1;
                const reply = Number(task.taskType) === 5
                    ? await mutate('BatchClaimTaskReward', { ids: [input.taskId] })
                    : await mutate('ClaimTaskReward', { id: input.taskId, do_shared: doShared });
                if (!reply?.task_info) throw new Error('牧场领奖响应缺少 task_info');
                record(input.action, reply, trigger, input, { state: autoContext.state });
                return { reply: describeResource(reply) };
            }
            if (input.action === 'claimIllustrated' || input.action === 'claimWeight') {
                let reply;
                if (input.action === 'claimIllustrated') {
                    const list = await rpc('GetIllustratedListV2', { rarity: 0, type: 101 });
                    if (!list.has_claimable_reward) throw new Error('当前没有可领取的牧场图鉴奖励');
                    reply = await mutate('ClaimAllRewardsV2', { type: 101 });
                } else {
                    if (!Number.isSafeInteger(input.id) || input.id <= 0) throw new Error('无效重量积分奖励');
                    const score = await rpc('GetRanchWeightScoreV2', {});
                    const level = (score.levels || []).find(row => row.id === input.id);
                    if (!level || !level.can_claim || level.claimed) throw new Error('重量积分奖励未达到条件或已领取');
                    reply = await mutate('ClaimRanchWeightScoreRewardV2', { id: input.id });
                }
                record(input.action, reply, trigger, input, { state: autoContext.state });
                return { reply: describeResource(reply) };
            }
            const allowed = ['collect', 'clean', 'place', 'produce', 'harvest', 'addFeed', 'submitOrder', 'refreshOrder', 'feedAnimal', 'activateFacility', 'upgradeBuilding', 'completeUpgrade', 'sell', 'useCan'];
            if (!allowed.includes(input.action)) throw new Error('不支持的牧场动作');
            if (manualSale) {
                const { itemId, uid, count } = input;
                if (String(getUserState().gid) !== saleAccountId) throw new Error('牧场账号已变化，请重新确认');
                const expected = saleRewards(input.expectedRewards);
                if (!positiveDecimal(itemId) || !positiveDecimal(uid) || !Number.isSafeInteger(count) || count < 1 || count > 99999 || !expected.length) {
                    throw new Error('无效的单项出售数据，请刷新仓库并重新确认报价');
                }
                // Read under the same account/scene lease as Sell; never use a cached snapshot.
                const bag = await rpc('GetBag', { global_scene_id: 2, tab_id: 0 });
                if (bag?.global_scene_id !== 2) throw new Error('牧场背包场景不匹配，请刷新仓库后重新确认');
                const matches = (bag.physical_items || []).filter(row => String(row.uid) === String(uid));
                const item = matches.length === 1 ? normalizeItem(matches[0], true, true) : null;
                const quote = saleRewards(item?.manualSellPrices, BigInt(count));
                if (String(getUserState().gid) !== saleAccountId || !quote.length || String(item.id) !== String(itemId)
                    || BigInt(item.count) < BigInt(count) || JSON.stringify(quote) !== JSON.stringify(expected)) {
                    throw new Error('物品已变化、已锁定、库存不足或出售报价已变化，请刷新仓库后重新确认');
                }
                const sold = { id: String(itemId), uid: String(uid), count: String(count) };
                let reply;
                try {
                    reply = await mutate('Sell', { items: [sold] });
                } catch (err) {
                    throw new Error(`无法核对出售结果，请刷新仓库确认，请勿直接重试：${err.message}`, { cause: err });
                }
                const soldRows = reply?.sell_items;
                if (soldRows?.length !== 1 || Object.keys(sold).some(key => String(soldRows[0]?.[key]) !== sold[key])
                    || JSON.stringify(saleRewards(reply?.get_items)) !== JSON.stringify(quote)) {
                    throw new Error('出售回执与报价不一致，结果未知，请刷新仓库确认，请勿直接重试');
                }
                record(input.action, reply, trigger, input);
                return { reply: describeResource(reply), status: await snapshot(false) };
            }
            const state = await snapshot(true, !!automationKey);
            autoContext.state = state;
            let reply;
            if (input.action === 'sell' || input.action === 'useCan') {
                const rows = input.action === 'sell' && input.items !== undefined ? input.items : [input];
                if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw new Error('无效出售列表');
                const seen = new Set();
                const items = rows.map(row => {
                    if (!row || typeof row !== 'object') throw new Error('无效出售列表');
                    const key = `${row.itemId}:${row.uid || '0'}`;
                    if (seen.has(key)) throw new Error('出售列表包含重复物品');
                    seen.add(key);
                    if (!Number.isSafeInteger(row.count) || row.count <= 0 || (input.action !== 'sell' && row.count > 99999)) throw new Error('数量必须为有效正整数（罐头最多 99999）');
                    const item = state.items.find(i => String(i.id) === String(row.itemId) && String(i.uid || '0') === String(row.uid || '0'));
                    if (!item || item.locked || BigInt(item.count || 0) < BigInt(row.count)) throw new Error('物品不存在、已锁定或可用数量不足');
                    if (input.action === 'sell' && !item.canSell) throw new Error('仅支持出售未锁定的牧场产物');
                    if (input.action === 'useCan' && !item.canUseCan) throw new Error('仅支持已有牧场罐头装填');
                    return { id: String(item.id), uid: String(item.uid || '0'), count: String(row.count) };
                });
                reply = await mutate(input.action === 'sell' ? 'Sell' : 'BatchUse', { items });
            } else if (input.action === 'feedAnimal') {
                if (![1, 2].includes(input.bucketType)) throw new Error('无效罐头容器类型');
                const ranch = state.ranches.find(r => String(r.ranchInstId) === String(input.ranchId));
                const animal = ranch?.animals.find(a => String(a.animalInstId) === String(input.animalInstId));
                if (!animal || !animal.canFeed || animal.canHarvest) throw new Error('动物当前不可使用罐头容器');
                if (input.bucketType === 2 && animal.limitedCanUsed) throw new Error('该动物已使用本阶段受限罐头');
                const itemId = input.bucketType === 1 ? '7004' : '7003';
                const seconds = state.items.filter(i => String(i.id) === itemId && !i.locked).reduce((n, i) => n + BigInt(i.count || 0), 0n);
                if (seconds <= 0n) throw new Error('罐头容器剩余时长不足，不自动补充或购买');
                reply = await mutate('FeedAnimal', { targets: [{ ranch_inst_id: String(ranch.ranchInstId), animal_inst_id: animal.animalInstId }], bucket_type: input.bucketType });
            } else if (input.action === 'activateFacility') {
                // READY=3 is server-authoritative; never activate a virtual/locked cover.
                const facility = state.facilities.find(f => String(f.instId) === String(input.facilityInstId));
                if (!facility || facility.facilityKind !== 'MODULE_TYPE_RANCH_SHED' || Number(facility.state) !== 3 || facility.upgradeState) throw new Error('棚尚未达到可解锁状态或已解锁');
                // Official ActivateFacility is a free READY→NORMAL activation, not BuyBuilding.
                reply = await mutate('ActivateFacility', { instance_id: String(facility.instId) });
                if (String(reply?.facility?.instance_id) !== String(facility.instId) || Number(reply.facility.state) !== 1) throw new Error('解锁棚响应缺少有效设施状态，请刷新后确认');
            } else if (input.action === 'upgradeBuilding' || input.action === 'completeUpgrade') {
                const facility = state.facilities.find(f => String(f.instId) === String(input.facilityInstId));
                if (!facility) throw new Error('设施不属于当前账号或已不存在');
                if (input.action === 'completeUpgrade') {
                    if (!facility.upgradeState || !(Number(facility.upgradeEndTime) > 0) || Number(facility.upgradeEndTime) * 1000 > now()) throw new Error('设施升级尚未到期');
                    reply = await mutate('CompleteBuildingUpgrade', { inst_id: String(facility.instId) });
                } else {
                    const blocked = upgradeBlockReason(facility, state, getUserState().level);
                    if (blocked) throw new Error(blocked);
                    const details = await rpc('GetFacilityDetail', { instance_id: String(facility.instId), host_gid: String(getUserState().gid) });
                    const costs = details.info?.upgrade_cost || [];
                    const signature = rows => JSON.stringify(rows.map(i => [String(i.id), String(i.count)]).sort((a, b) => a[0].localeCompare(b[0])));
                    if (!costs.length || !Array.isArray(input.costs) || signature(costs) !== signature(input.costs)) throw new Error('升级费用已变动，请刷新后重新确认');
                    for (const cost of costs) {
                        if (String(cost.id) !== '1007' || !/^\d+$/.test(String(cost.count))) throw new Error('不使用未开放的付费资源升级');
                        const balance = state.items.filter(i => String(i.id) === '1007' && !i.locked).reduce((n, i) => n + BigInt(i.count || 0), 0n);
                        if (balance < BigInt(cost.count)) throw new Error('金券不足，无法升级设施');
                    }
                    reply = await mutate('UpgradeBuilding', { inst_id: String(facility.instId) });
                }
            } else if (input.action === 'addFeed') {
                const facility = state.facilities.find(f => String(f.instId) === String(input.facilityInstId));
                const count = input.count;
                if (!facility?.feedMachine) throw new Error('牧草机不属于当前账号或已不存在');
                if (!Number.isInteger(count) || count <= 0 || count > 2147483647) throw new Error('牧草数量必须为正整数');
                const owned = state.items.filter(i => String(i.id) === '7001' && !i.locked && !i.is_locked).reduce((sum, i) => sum + BigInt(i.count || 0), 0n);
                if (owned < BigInt(count)) throw new Error('牧草库存不足，不自动使用货币购买');
                const capacity = Number(facility.capacity);
                if (!(capacity > 0) || count > capacity - Number(facility.feedMachine.feedCount)) throw new Error('超过牧草机剩余容量');
                // Official GrassMachineSyncHelper uses watchGid: zero means self home,
                // a positive gid denotes a visited home (even when it equals our account gid).
                reply = await mutate('AddFeed', { instance_id: String(facility.instId), add_count: count, use_gold: false, host_gid: '0' });
            } else if (input.action === 'submitOrder' || input.action === 'refreshOrder') {
                const order = state.orders.find(o => o.slotIndex === input.slotIndex && o.instanceId === input.instanceId);
                if (!order) throw new Error('订单已刷新或不存在，请刷新后重试');
                if (input.action === 'submitOrder') {
                    if (!order.canSubmit) throw new Error('订单尚不可提交或提交次数已用尽');
                    // Never consume currencies or locked/special instance items via an implicit order.
                    for (const req of order.requirements) {
                        if (!req.tabIds.includes(5)) throw new Error('该订单消耗物品尚未确认安全，暂不提交');
                        const owned = state.items.filter(i => String(i.id) === String(req.id) && !i.locked && !i.detail?.ranchProduct).reduce((sum, i) => sum + BigInt(i.count || 0), 0n);
                        if (owned < BigInt(req.count || 0)) throw new Error('订单可用库存不足或含锁定/特殊物品');
                    }
                    reply = await mutate('SubmitOrder', { slot_index: order.slotIndex, instance_id: order.instanceId });
                } else {
                    if (!order.canRefresh) throw new Error('订单刷新次数已用尽');
                    reply = await mutate('RefreshOrder', { slot_index: order.slotIndex });
                }
            } else {
                const id = String(input.ranchId ?? '');
                if (!/^[1-9]\d*$/.test(id)) throw new Error('无效窝棚实例');
                const ranch = state.ranches.find(r => String(r.ranchInstId) === id);
                if (!ranch) throw new Error('窝棚不属于当前账号或已不存在');
                if (input.action === 'collect') {
                    if (!ranch.shelves.some(s => s.canCollect)) throw new Error('当前没有可收集的货架产物');
                    reply = await mutate('HarvestRanch', { ranch_inst_ids: [id], op: 2, animals: [], shelves: [] });
                } else if (input.action === 'clean') {
                    const hazards = ranch.hazards || [];
                    if (!hazards.length) throw new Error('当前没有可清理的灾害');
                    reply = await mutate('CleanRanch', { host_gid: String(getUserState().gid), hazard_ids: hazards.map(h => h.hazardId) });
                } else if (input.action === 'place') {
                    if (Number(ranch.animalCount) >= Number(ranch.capacity)) throw new Error('栏舍已满');
                    const animal = animalMap.get(String(input.itemId));
                    if (input.source === 'bag') {
                        if (!animal?.enable_flag || animal.husbandry_type !== ({ 1: '窝', 2: '棚' })[ranch.husbandryType]) throw new Error('幼崽不适合当前栏舍');
                        const count = state.items.filter(i => String(i.id) === String(input.itemId) && !i.locked).reduce((n, i) => n + BigInt(i.count || 0), 0n);
                        if (count <= 0n) throw new Error('背包幼崽不足');
                        reply = await mutate('PlaceAnimal', { items: [{ ranch_inst_id: id, animal_id: String(animal.id) }] });
                    } else {
                    const row = [...goodsMap.values()].find(g => g.shop_id === 5 && String(g.item_id) === String(input.itemId));
                    if (!animal?.enable_flag || animal.husbandry_type !== ({ 1: '窝', 2: '棚' })[ranch.husbandryType] || !row || row.price_id !== 1007) throw new Error('幼崽不适合当前栏舍或不支持金券购买');
                    const shop = await rpc('ShopInfo', { shop_id: 5 });
                    const goods = (shop.goods_list || []).find(g => String(g.id) === String(row.id));
                    if (!goods?.unlocked || goods.owned) throw new Error('幼崽未解锁或已下架');
                    if (BigInt(goods.limit_count || 0) > 0n && BigInt(goods.bought_num || 0) >= BigInt(goods.limit_count)) throw new Error('幼崽购买限额已用尽');
                    const second = now() / 1000;
                    if (Number(goods.discount_price) > 0 && second >= Number(goods.discount_start_time) && second < Number(goods.discount_end_time)) throw new Error('限时折扣价格语义待确认，暂不购买');
                    if (!/^[1-9]\d*$/.test(String(goods.price))) throw new Error('幼崽价格无效');
                    const balance = state.items.filter(i => String(i.id) === '1007' && !i.locked).reduce((n, i) => n + BigInt(i.count || 0), 0n);
                    if (balance < BigInt(goods.price)) throw new Error('金券不足');
                    if (automationKey && balance - BigInt(goods.price) < BigInt(normalizePolicy(getSettings().ranch_policy).goldReserve)) throw new Error('购买幼崽将低于金券保留量');
                    reply = await mutate('BuyGoods', { goods_id: String(row.id), num: '1', price: String(goods.price), auto_add: true });
                    }
                } else {
                    const animal = ranch.animals.find(a => String(a.animalInstId) === String(input.animalInstId));
                    if (!animal) throw new Error('动物已不存在或不属于当前栏舍');
                    const ref = { ranch_inst_id: id, animal_inst_id: animal.animalInstId };
                    if (input.action === 'produce') {
                        if (!animal.canTriggerProduce) throw new Error('动物当前不可生产');
                        reply = await mutate('TriggerProduce', { host_gid: String(getUserState().gid), targets: [ref] });
                    } else {
                        if (!animal.canHarvest) throw new Error('动物当前不可收获');
                        reply = await mutate('HarvestRanch', { ranch_inst_ids: [], op: 4, animals: [ref], shelves: [] });
                    }
                }
            }
            record(input.action, reply, trigger, input, { state: autoContext.state });
            // A refresh failure must not turn a completed mutation into a retryable failure.
            return { reply: describeResource(reply), status: await snapshot(false, !!automationKey) };
        })).catch(err => {
            // Expected races with other visitors: keep the failure semantics, but avoid
            // flooding automatic operation logs when there is simply nothing to do.
            const quietCode = { steal: '1045220', help: '1045233', putHazard: '1045230' }[input.action];
            if (trigger === 'automatic' && quietCode && new RegExp(`\\bcode=${quietCode}\\b`).test(err.message)) throw err;
            const logInput = input.action === 'sell' && input.items !== undefined
                ? { ...input, items: Array.isArray(input.items) ? input.items.filter(row => row && typeof row === 'object') : undefined }
                : input;
            const detail = details(logInput);
            log('牧场', `${trigger === 'automatic' ? '自动' : '手动'}${ACTION_NAMES[input.action] || input.action}失败${detail.text ? `（${detail.text}）` : ''}：${err.message}`, { scene: 'ranch', module: ranchOperationModule(input.action), event: input.action, trigger, result: 'error', reason: err.message, ...detail.meta });
            throw err;
        });
    }
    async function getResource(resource, { fresh: bypassCache = false, rosterScan, rosterCheckpoint } = {}) {
        if (resource === 'analytics') {
            const animals = config.MCAnimalConfig.filter(a => a.enable_flag).map(raw => {
                const animal = describeResource(raw);
                for (const key of ['productItem', 'byproductItem']) if (animal[key]) animal[key].name = itemMap.get(String(animal[key].id))?.name || `物品 ${animal[key].id}`;
                const cycleSeconds = Number(raw.infant_sec || 0) + Number(raw.grow_sec || 0) + Number(raw.mature_sec || 0);
                // 分析页动物名旁展示成年形态图片（与牧场个人页窝位同一套本地素材）。
                const image = animalIcons[String(raw.id)]?.[4] || animal.image || '';
                return { ...animal, image, cycleSeconds, harvestExpPerHour: cycleSeconds > 0 ? Number(raw.harvest_exp || 0) * 3600 / cycleSeconds : null };
            });
            return { animals, summary: { animalCount: animals.length }, assumptions: '依据官方基础配置；周期为幼崽、成长、成熟时长之和，未计生产等待、饲料中断、增益和变异，不代表实际收益。' };
        }
        if (resource === 'activity') return { activities: [], message: '暂无已登记的牧场限时活动' };
        if (resource === 'dailyBenefit') return exclusive(() => session.inRanch(async () => {
            // 每日福利一天只变一次：短期缓存避免每次刷新都打商城接口。
            const today = dayKey();
            const fresh = dailyBenefitCache.day === today && dailyBenefitCache.state && now() - dailyBenefitCache.at < 60000;
            if (bypassCache || !fresh) {
                if (!send) throw new Error('牧场每日福利缺少网络发送器');
                dailyBenefitCache.state = await createRanchDailyBenefit({ send }).read(now());
                dailyBenefitCache.day = today;
                dailyBenefitCache.at = now();
            }
            return dailyBenefitCache.state;
        }));
        return exclusive(() => session.inRanch(async () => {
            if (resource === 'tasks') return { tasks: await readTasks() };
            if (resource === 'profile') {
                const user = getUserState();
                // Own profile must not depend on the cross-user BatchGetBasicInfo RPC.
                // Use the same cumulative ranch XP and official thresholds as upgrades.
                const bag = await rpc('GetBag', { global_scene_id: 2, tab_id: 0 });
                const items = [...(bag.physical_items || []), ...(bag.virtual_items || [])];
                const level = ranchLevel(items);
                if (level == null) {
                    const error = new Error('服务端未返回有效的牧场经验：牧场背包 GetBag(scene=2) 缺少或包含无效的经验项 1102；本次无法计算等级与升级进度，请稍后刷新（不会以农场经验或 0 替代）');
                    error.code = 'RANCH_PROFILE_INCOMPLETE';
                    error.method = 'GetBag';
                    error.scene = 'ranch';
                    throw error;
                }
                const exp = items.filter(i => String(i.id) === '1102').reduce((sum, i) => sum + BigInt(i.count), 0n);
                if (exp > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('牧场经验超出安全计算范围');
                const levels = require('../gameConfig/RanchLevel.json');
                const current = levels.find(row => row.level === level);
                const next = levels.find(row => row.level === level + 1);
                return { name: user.name, avatar: user.avatar, level, exp: String(exp),
                    levelProgress: current && next ? { current: Math.max(0, Number(exp) - current.exp), needed: next.exp - current.exp } : null };
            }
            if (resource === 'friends') {
                const all = await readFriends({ scan: rosterScan, checkpoint: rosterCheckpoint });
                if (!all) return null; // Automation yielded before the full roster was available.
                const reply = { friends: all.friends };
                if (rosterScan) return reply; // Patrol does not need visitor history.
                let visitors = []; let visitorsError = null;
                try { visitors = describeResource((await rpc('InteractRecords', { global_scene_id: 2 })).records || []); }
                catch (err) { visitorsError = err.message; }
                return { ...camelize(reply), visitors, visitorsError, blockedPlayers: camelize(all.blocked_players || []), capabilities: CAPABILITIES };
            }
            if (resource === 'shop') {
                const errors = {};
                const shops = [];
                let profiles = [];
                try { profiles = (await rpc('ShopProfiles', { global_scene_id: 2 })).shop_profiles || []; }
                catch (err) { errors.profiles = err.message; }
                for (const shopId of [5, 6]) {
                    const name = profiles.find(p => String(p.shop_id) === String(shopId))?.shop_name || shopConfig.MCShop.find(p => p.id === shopId)?.type || `牧场商店 ${shopId}`;
                    try { const data = describeResource(await rpc('ShopInfo', { shop_id: shopId }));
                        data.goodsList = (data.goodsList || []).map(g => { const row = goodsMap.get(String(g.id)); const itemId = g.itemId ?? row?.item_id; return { ...g, itemId, name: itemMap.get(String(itemId))?.name || g.name, image: ranchItemImage(itemId), itemCount: g.itemCount ?? row?.item_count, priceId: row?.price_id, currencyName: itemMap.get(String(row?.price_id))?.name, maxQuantity: row?.one_buy_count || 99 }; });
                        shops.push({ shopId, name, ...data }); }
                    catch (err) { shops.push({ shopId, name, error: err.message, goodsList: [] }); }
                }
                let exchangeMarket;
                try { exchangeMarket = { shopId: 7, ...describeResource(await rpc('RotationShopInfo', { shop_id: 7 })) };
                    exchangeMarket.goods = (exchangeMarket.goods || []).map(g => ({ ...g, effectiveCostCount: Number(g.discountPrice) > 0 && now() / 1000 >= Number(g.discountStartTime) && now() / 1000 < Number(g.discountEndTime) ? g.discountPrice : g.costCount })); }
                catch (err) { errors.exchange = err.message; }
                let balance = null;
                let resources = SHOP_RESOURCE_IDS.map(id => ({ id, name: itemMap.get(String(id))?.name, image: ranchItemImage(id), count: null }));
                try {
                    const bag = await rpc('GetBag', { global_scene_id: 2, tab_id: 0 });
                    const items = [...(bag.physical_items || []), ...(bag.virtual_items || [])];
                    resources = resources.map(resource => ({ ...resource, count: items.filter(i => String(i.id) === String(resource.id) && !i.locked && !i.is_locked).reduce((n, i) => n + BigInt(i.count || 0), 0n).toString() }));
                    balance = resources.find(r => r.id === 1007).count;
                } catch (err) { errors.balance = err.message; }
                return { shops, exchangeMarket, errors, balance, resources, capabilities: CAPABILITIES };
            }
            if (resource === 'illustratedClaimStatus') {
                const list = await rpc('GetIllustratedListV2', { rarity: 0, type: 101 });
                return list.has_claimable_reward === true;
            }
            if (resource === 'weightClaimStatus') {
                const score = await rpc('GetRanchWeightScoreV2', {});
                return score.levels || [];
            }
            if (resource === 'illustrated') {
                const list = await rpc('GetIllustratedListV2', { rarity: 0, type: 101 });
                const errors = {};
                let levels, weightScore;
                try { levels = await rpc('GetIllustratedLevelListV2', { type: 101 }); } catch (err) { errors.levels = err.message; }
                try { weightScore = await rpc('GetRanchWeightScoreV2', {}); } catch (err) { errors.weight = err.message; }
                return { ...describeResource(list), levels: describeResource(levels), weightScore: describeResource(weightScore), errors, capabilities: CAPABILITIES };
            }
            throw new Error('未知牧场功能');
        }));
    }
    function saveTotalOperationsNow() {
        if (totalOperationsSaveTimer) { clearTimeout(totalOperationsSaveTimer); totalOperationsSaveTimer = null; }
        const file = totalStatsFile();
        if (!file) return;
        try { writeJsonFileAtomic(file, { totalOperations: { ...totalOperations }, savedAt: Date.now() }); } catch { }
    }
    return { connect, disconnect, action, getResource,
        getStatus, getOperationStats,
        flushTotalOperations() { loadTotalOperations(); saveTotalOperationsNow(); },
        getAutomationSchedule() { return scheduler.status(scheduledSettings(), normalizePolicy(getSettings().ranch_policy)); },
        async tickAutomation() {
            observeDisabledDailyBenefit();
            if (planEpoch !== session.getEpoch?.()) { maturityPlan.reset(); continuations.clear(); scheduler.reset(); planEpoch = session.getEpoch?.(); }
            const readyReason = () => !getUserState().gid ? '账号未登录'
                : automationRunning ? '上轮巡查执行中'
                    : session.snapshot?.().blockedScenes?.includes('ranch') ? '牧场场景被服务端拒绝，等待重新登录' : '';
            // The scene executor serializes reads, manual writes and automation. Enqueue
            // a due patrol even while another transaction holds the lease, or polling
            // readers can keep operation > 0 forever and starve the patrol.
            let ran = false;
            const reason = readyReason();
            const result = await scheduler.tick({ settings: scheduledSettings, stealDelay: () => maturityPlan.nextDelay({ autoSteal: true }), policy: () => normalizePolicy(getSettings().ranch_policy),
                ready: () => !readyReason(),
                run: async group => {
                    ran = true;
                    const outcome = await this.runAutomation(group);
                    patrolSummary(outcome?.status === 'deferred' ? '跳过' : outcome?.cancelled ? '取消' : outcome?.status === 'yielded' ? '分片待续' : '完成', group);
                    return outcome;
                } });
            if (!ran) patrolSummary('跳过', reason || (Object.values(scheduledSettings()).some(Boolean) ? '尚未到巡查时间或已有巡查等待场景' : '自动任务未开启'));
            return result;
        },
        async runAutomation(group = 'all') {
            observeDisabledDailyBenefit();
            return session.inRanch(async () => {
                const runSettings = () => Object.fromEntries(Object.entries(settings()).map(([key, value]) => [key, value && inGroup(key, group)]));
                if (!getUserState().gid || operation || automationRunning) return { status: 'deferred' };
                if (planEpoch !== session.getEpoch?.()) { maturityPlan.reset(); continuations.clear(); planEpoch = session.getEpoch?.(); }
                const p = normalizePolicy(getSettings().ranch_policy);
                const opts = runSettings();
                if (!Object.values(opts).some(Boolean)) { continuations.delete(group); return { status: 'completed' }; }
                const automationEpoch = session.getEpoch?.();
                const signature = JSON.stringify([opts, p]);
                let progress = continuations.get(group);
                if (!progress || progress.signature !== signature) {
                    progress = { signature, done: new Set() };
                    continuations.set(group, progress);
                }
                let advanced = false, yielded = false, actionCount = 0;
                const identity = (payload, key = ACTION_SWITCH[payload.action]) => {
                    const { count, price, costCount, costs, ...target } = payload;
                    return JSON.stringify([key, target]);
                };
                // Always allow one new complete action per slice. Slow prerequisite reads must
                // not make the same tail action yield forever before it can make progress.
                const alive = () => {
                    // An invalid lease must end this slice, not visit every remaining
                    // friend and repeatedly report cancellation from the same failure.
                    try { session.assertAllowed(); } catch { return false; }
                    if (!getUserState().gid || automationEpoch !== session.getEpoch?.()) return false;
                    if (actionCount >= p.maxActionsPerRun || (advanced && session.shouldYield?.())) { yielded = true; return false; }
                    return true;
                };
                automationRunning = true;
                lastAutomationAt = now();
                let cachedState;
                const readState = async () => cachedState || (cachedState = await snapshot(false, true));
                try {
                    const attempt = async (payload, key = ACTION_SWITCH[payload.action]) => {
                        const id = identity(payload, key);
                        if (progress.done.has(id) || !alive()) return;
                        // Mark before sending, including uncertain failures: never replay a write
                        // merely because a slice yielded. The action still performs live validation.
                        progress.done.add(id); advanced = true; actionCount++;
                        cachedState = null;
                        try {
                            const result = await action(payload, key);
                            if (result?.status) cachedState = result.status;
                            return result;
                        } catch { /* action logs its own failure; continue independent tasks */ }
                    };
                    const automationService = {
                        action: (...args) => this.action(...args),
                        getStatus: readState,
                        getResource: (resource, options) => this.getResource(resource, options),
                    };
                    const state = group === 'farm' || group === 'all' ? await readState() : { ranches: [], orders: [] };
                    for (const ranch of state.ranches || []) {
                        if (!alive()) break;
                        // Re-read switches before each action; yielding occurs only between complete actions.
                        if (runSettings().autoCollect && ranch.shelves.some(s => s.canCollect)) await attempt({ action: 'collect', ranchId: ranch.ranchInstId });
                        if (runSettings().autoClean && ranch.hazards.length) await attempt({ action: 'clean', ranchId: ranch.ranchInstId });
                        for (const animal of ranch.animals) {
                            if (runSettings().autoProduce && animal.canTriggerProduce && getUserState().gid) await attempt({ action: 'produce', ranchId: ranch.ranchInstId, animalInstId: animal.animalInstId });
                            if (runSettings().autoHarvest && animal.canHarvest && getUserState().gid) await attempt({ action: 'harvest', ranchId: ranch.ranchInstId, animalInstId: animal.animalInstId });
                        }
                    }
                    if (runSettings().autoSubmitOrders) {
                        for (const order of state.orders || []) {
                            if (!alive() || !runSettings().autoSubmitOrders) break;
                            if (order.canSubmit) await attempt({ action: 'submitOrder', slotIndex: order.slotIndex, instanceId: order.instanceId });
                        }
                    }
                    if (alive() && runSettings().autoClaimTasks) {
                        try {
                            // Re-read after each claim so newly unlocked growth stages can proceed.
                            // Each ID is attempted once per pass, including uncertain write failures.
                            while (alive() && runSettings().autoClaimTasks) {
                                const tasks = (await automationService.getResource('tasks')).tasks;
                                const task = tasks.find(t => [4, 5].includes(Number(t.taskType)) && t.isUnlocked && !t.isClaimed &&
                                    BigInt(t.totalProgress || 0) > 0n && BigInt(t.progress || 0) >= BigInt(t.totalProgress) &&
                                    !progress.done.has(identity({ action: 'claimTask', taskId: String(t.id) })));
                                if (!task) break;
                                await attempt({ action: 'claimTask', taskId: String(task.id) });
                            }
                        } catch (err) { log('牧场', `自动任务领奖查询失败：${err.message}`, { scene: 'ranch', module: ranchOperationModule('claimTask'), event: 'claimTask', result: 'error' }); }
                    }
                    if (alive() && runSettings().autoClaimIllustrated) {
                        try {
                            const claimable = await automationService.getResource('illustratedClaimStatus');
                            if (claimable && runSettings().autoClaimIllustrated) await attempt({ action: 'claimIllustrated' });
                        }
                        catch (err) { log('牧场', `自动图鉴查询失败：${err.message}`, { scene: 'ranch', module: ranchOperationModule('claimIllustrated'), event: 'claimIllustrated', result: 'error' }); }
                    }
                    if (alive() && runSettings().autoClaimWeight) {
                        try {
                            const levels = await automationService.getResource('weightClaimStatus');
                            for (const level of levels) {
                                if (!alive() || !runSettings().autoClaimWeight) break;
                                if (level.can_claim && !level.claimed) await attempt({ action: 'claimWeight', id: level.id });
                            }
                        } catch (err) { log('牧场', `自动重量积分查询失败：${err.message}`, { scene: 'ranch', module: ranchOperationModule('claimWeight'), event: 'claimWeight', result: 'error' }); }
                    }
                    await runRanchExtraAutomation({
                        service: automationService, attempt, continuation: progress, hasCompleted: (payload, key) => progress.done.has(identity(payload, key)), onLimit: () => { yielded = true; }, settings: runSettings, policy: () => normalizePolicy(getSettings().ranch_policy),
                        alive, goodsMap, accountId: getUserState().gid, now,
                        readFriendRoster: async () => {
                            const roster = await automationService.getResource('friends', {
                                rosterScan: progress.friendRoster ||= {},
                                rosterCheckpoint: completedRead => {
                                    if (completedRead) advanced = true;
                                    return alive();
                                },
                            });
                            if (roster) { advanced = true; alive(); }
                            return roster;
                        },
                        getCursor: () => friendCursors[group], setCursor: value => { friendCursors[group] = value; },
                        now, maturityPlan: group === 'steal' || (group === 'all' && p.mode === 'simple') ? maturityPlan : null,
                        logError: err => log('牧场', `自动任务查询失败：${err.message}`, { scene: 'ranch', module: 'ranch', event: 'automation', trigger: 'automatic', result: 'error' }),
                    });
                    if (!getUserState().gid || automationEpoch !== session.getEpoch?.()) {
                        continuations.delete(group);
                        return { cancelled: true };
                    }
                    if (!yielded) continuations.delete(group);
                    const clock = serverNow();
                    const latest = cachedState || state;
                    const deadlines = [
                        ...(latest.ranches || []).flatMap(r => (r.animals || []).flatMap(a => [a.infantReadyAtMs, a.growReadyAtMs, a.produceReadyAtMs, a.matureReadyAtMs])),
                        ...(latest.facilities || []).filter(f => f.upgradeState).map(f => Number(f.upgradeEndTime) * 1000),
                    ].map(Number).filter(at => Number.isFinite(at) && at > clock);
                    return { status: yielded ? 'yielded' : 'completed', nextAt: deadlines.length ? now() + Math.max(1000, Math.min(...deadlines) - clock) : undefined };
                } finally {
                    automationRunning = false;
                }
            }, { key: `automation:${group}` }).catch(err => {
                if (err.code === 'SCENE_CANCELLED') return { cancelled: true };
                throw err;
            });
        },
    };
}
let singleton;
/** 立即落盘牧场全期统计（worker 停止时调用，与农场 stats.js 的 saveStats 对齐） */
function flushRanchStats() {
    if (!singleton) return;
    try { singleton.flushTotalOperations(); } catch { }
}
function getRanchService() {
    if (!singleton) {
        const { sendMsgAsync, getUserState } = require('../utils/network');
        const protocol = createRanchProtocol();
        singleton = createRanchService({ getUserState, serverNow: () => require('../utils/utils').getServerTimeSec() * 1000,
            getSettings: () => require('../models/store').getAutomation(),
            log: require('../utils/utils').log,
            send: async (service, method, body, timeout) => {
                const { body: replyBody } = await sendMsgAsync(service, method, body, timeout);
                return replyBody;
            },
            rpc: async (method, params) => {
                const def = protocol.rpc[method];
                const { body } = await sendMsgAsync(def.service, method, protocol.encode(method, params));
                return protocol.decode(method, body);
            },
        });
    }
    return singleton;
}
module.exports = { createRanchService, getRanchService, flushRanchStats, normalizeSnapshot, normalizeSettings, SETTINGS_KEYS, CAPABILITIES };
