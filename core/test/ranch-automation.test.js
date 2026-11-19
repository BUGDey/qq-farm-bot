const test = require('node:test');
const assert = require('node:assert/strict');
const { createRanchService } = require('../src/services/ranch');
const { createRanchSession } = require('../src/services/ranch-session');
const { normalizePolicy, normalizeSettings, SETTINGS_KEYS } = require('../src/services/ranch-settings');
const MUTATIONS = new Set(['Sell', 'BatchUse', 'AddFeed', 'PlaceAnimal', 'BuyGoods', 'RotationBuyGoods', 'StealProduce', 'CleanAllRanch', 'StrokeAnimal', 'PutHazard']);
function fixture(clock = Date.now, serverClock = clock, roster = {}) {
    const calls = []; const logs = [];
    const automation = { ranch_policy: normalizePolicy() };
    const items = [
        { id: '2060001', uid: '9007199254740995', count: '30' }, { id: '1060004', uid: '12', count: '40' },
        { id: '80021', uid: '13', count: '20' }, { id: '80031', uid: '14', count: '12' },
        { id: '7001', uid: '15', count: '1000' }, { id: '60001', uid: '16', count: '2' },
        { id: '1007', count: '100000' }, { id: '7002', count: '1000' }, { id: '1008', count: '1000' },
        { id: '7003', count: '0' }, { id: '7004', count: '0' },
    ];
    const own = { ranch_inst_id: '9007199254740993', husbandry_type: 1, animal_count: 0, capacity: 3, animals: [], shelves: [], hazards: [] };
    const friend = { ranch_inst_id: '10001', husbandry_type: 1, animal_count: 1, capacity: 3, animals: [{ animal_inst_id: 35, animal_id: '60001', mutation: { strokable: true, mutation_type: 0, stroked_gids: [] } }], shelves: [{ slot_index: 0, can_steal: true }], hazards: [{ hazard_id: '1' }] };
    const cells = { facilities: [{ instance_id: '9', facility_id: 6001001, ranch: own }, { instance_id: '10', facility_id: 1, capacity: 1000, feed_machine: { feed_count: 20 } }] };
    let friends = [{ gid: '456' }];
    const overrides = {};
    const delta = (id, n) => { const i = items.find(i => i.id === id); i.count = String(BigInt(i.count) + BigInt(n)); };
    const responses = (method, params) => {
        switch (method) {
            case 'AllCells': return cells;
            case 'GetRanchDetail': return { ranches: [params.host_gid === '123' ? own : friend] };
            case 'GetBag': return { physical_items: items };
            case 'GetBagTab': case 'GetOrderPanel': case 'InteractRecords': case 'LeaveHomestead': case 'ShopProfiles': return {};
            case 'GetAll': return { game_friends: friends.map(row => ({ big_farm_status: {}, ...row })) };
            case 'GetGameFriends': return { friends };
            case 'EnterHomestead': return { homestead_cells: { facilities: [{ instance_id: '8', facility_id: 6001001, ranch: friend }] } };
            case 'GetRanchOpTimes': return { ops: [{ op_id: '11003', remaining_times: '100' }, { op_id: '11009', remaining_times: '10' }] };
            case 'Sell': for (const item of params.items) delta(item.id, -BigInt(item.count)); return {};
            case 'BatchUse': {
                const i = params.items[0]; delta(i.id, -BigInt(i.count)); delta(i.id === '80021' ? '7003' : '7004', BigInt(i.count) * 3600n); return {};
            }
            case 'AddFeed': delta('7001', -params.add_count); cells.facilities[1].feed_machine.feed_count += params.add_count; return {};
            case 'PlaceAnimal': delta('60001', -1); own.animal_count++; return {};
            case 'ShopInfo': return { goods_list: params.shop_id === 6 ? [{ id: '10001', price: '60', unlocked: true }] : [{ id: '10002', price: '2', unlocked: true }] };
            case 'BuyGoods': delta('1007', -BigInt(params.num) * BigInt(params.price)); delta(params.goods_id === '10001' ? '7001' : '60001', BigInt(params.num)); return {};
            case 'RotationShopInfo': return { opened: true, present: true, period_day: '20261116', round_index: 1, goods: [{ goods_id: '101', item_id: '7001', item_count: '10', cost_item_id: '7002', cost_count: '5', limit_count: '10', limit_used: '0' }] };
            case 'RotationBuyGoods': delta('7002', -5 * params.count); delta('7001', 10 * params.count); return {};
            case 'StealProduce': friend.shelves[0].can_steal = false; return {};
            case 'CleanAllRanch': friend.hazards = []; return {};
            case 'StrokeAnimal': friend.animals[0].mutation.stroked_gids.push('123'); return {};
            case 'PutHazard': return { actual_count: '1' };
            default: throw new Error(`Unexpected RPC ${method}`);
        }
    };
    const session = createRanchSession();
    const service = createRanchService({ getKnownFriendGids: () => [], ...roster, session, now: clock, getUserState: () => ({ gid: '123' }), getSettings: () => automation,
        serverNow: serverClock, log: (...args) => logs.push(args), rpc: async (method, params) => {
            calls.push({ method, params });
            if (overrides[method] instanceof Error) throw overrides[method];
            return structuredClone(overrides[method] ? await overrides[method](params) : responses(method, params));
        } });
    const enable = (...keys) => { for (const key of keys) automation[SETTINGS_KEYS[key]] = true; };
    const setPolicy = patch => { automation.ranch_policy = normalizePolicy({ ...automation.ranch_policy, ...patch }, true); };
    return { service, session, calls, logs, automation, enable, setPolicy, own, friend, items, overrides, responses, setFriends: value => { friends = value; } };
}

test('QQ ranch patrol yields to queued farm work and resumes at the next roster batch', async () => {
    const seeds = Array.from({ length: 71 }, (_, i) => String(1000 + i));
    const f = fixture(Date.now, Date.now, { getPlatform: () => 'qq', getKnownFriendGids: () => seeds });
    f.enable('autoSteal');
    f.setFriends([]);
    f.setPolicy({ friendIncludeGids: [seeds.at(-1)] });
    let startBatch, releaseBatch;
    const started = new Promise(resolve => { startBatch = resolve; });
    const gate = new Promise(resolve => { releaseBatch = resolve; });
    f.overrides.GetGameFriends = async ({ friend_gids }) => {
        if (friend_gids.length === 35 && friend_gids[0] === seeds[0]) {
            startBatch();
            await gate;
        }
        return { friends: friend_gids.map(gid => ({ gid, big_farm_status: {} })) };
    };
    const patrol = f.service.runAutomation('steal');
    await started;
    const farm = f.session.inFarm(() => { f.calls.push({ method: 'FarmWork' }); }, { manual: true });
    releaseBatch();
    assert.equal((await patrol).status, 'yielded');
    await farm;
    assert.deepEqual(f.calls.map(c => c.method), ['GetAll', 'GetGameFriends', 'FarmWork']);
    assert.equal((await f.service.runAutomation('steal')).status, 'completed');
    assert.deepEqual(f.calls.filter(c => c.method === 'GetGameFriends').slice(0, 3).map(c => c.params), [
        { friend_gids: seeds.slice(0, 35), global_scene_id: 2 },
        { friend_gids: seeds.slice(35, 70), global_scene_id: 2 },
        { friend_gids: seeds.slice(70), global_scene_id: 2 },
    ]);
    assert.deepEqual(f.calls.filter(c => c.method === 'EnterHomestead').map(c => c.params.host_gid), [seeds.at(-1), seeds.at(-1)]);
    assert.equal(f.calls.some(c => c.method === 'InteractRecords'), false);
});

test('all opt-ins default off, empty rules never consume resources merely by enabling', async () => {
    assert.equal(Object.keys(SETTINGS_KEYS).length, 25);
    assert.equal(Object.values(normalizeSettings({})).some(Boolean), false);
    const f = fixture(); await f.service.runAutomation(); assert.equal(f.calls.length, 0);
    f.enable('autoSell', 'autoUseCan', 'autoPlace', 'autoBuy', 'autoExchange');
    await f.service.runAutomation();
    assert.equal(f.calls.some(c => MUTATIONS.has(c.method) && c.method !== 'Sell'), false);
});

test('all four friend tasks use shared action validators and close every visit', async () => {
    const f = fixture(); f.enable('autoSteal', 'autoHelp', 'autoStroke', 'autoPutHazard');
    await f.service.runAutomation();
    for (const method of ['StealProduce', 'CleanAllRanch', 'StrokeAnimal', 'PutHazard']) assert.equal(f.calls.filter(c => c.method === method).length, 1);
    assert.equal(f.calls.filter(c => c.method === 'EnterHomestead').length, f.calls.filter(c => c.method === 'LeaveHomestead').length);
    assert.equal(f.calls.some(c => c.method === 'PlayerSceneLogin'), false);
});

test('friend include/exclude lists are independent and exclusions win', async () => {
    const f = fixture(); f.enable('autoSteal'); f.setPolicy({ friendIncludeGids: ['456'], friendExcludeGids: ['456'] });
    await f.service.runAutomation();
    assert.equal(f.calls.some(c => c.method === 'EnterHomestead'), false);
});

test('bounded friend cursor rotates across runs without starving later friends', async () => {
    const f = fixture(); f.enable('autoStroke'); f.friend.animals[0].mutation.strokable = false;
    f.setFriends(['456', '457', '458', '459'].map(gid => ({ gid }))); f.setPolicy({ friendBatchSize: 2 });
    await f.service.runAutomation(); await f.service.runAutomation();
    assert.deepEqual(f.calls.filter(c => c.method === 'EnterHomestead').map(c => c.params.host_gid), ['456', '457', '458', '459']);
});

test('friend quota refusal is logged and does not block unrelated help and care', async () => {
    const f = fixture(); f.enable('autoSteal', 'autoHelp', 'autoStroke'); f.overrides.StealProduce = new Error('quota exhausted');
    await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'StealProduce').length, 1);
    assert.equal(f.calls.filter(c => c.method === 'StrokeAnimal').length, 1);
    assert.ok(f.logs.some(l => l[2].event === 'steal' && l[2].result === 'error'));
});

test('already-stolen produce is silent for automation and does not block other friend tasks', async () => {
    const f = fixture(); f.enable('autoSteal', 'autoHelp', 'autoStroke');
    f.overrides.StealProduce = new Error('gamepb.animalpb.AnimalService.StealProduce 错误: code=1045220 这份产物你已经偷过啦，去其他好友家看看吧');
    await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'StealProduce').length, 1);
    assert.ok(f.calls.some(c => c.method === 'LeaveHomestead'));
    assert.ok(f.calls.some(c => c.method === 'CleanAllRanch'));
    assert.ok(f.calls.some(c => c.method === 'StrokeAnimal'));
    assert.equal(f.logs.some(l => l[2].event === 'steal'), false);
    await assert.rejects(f.service.action({ action: 'steal', hostGid: '456', ranchId: '10001', slotIndex: 0 }), /1045220/);
    assert.ok(f.logs.some(l => l[2].event === 'steal' && l[2].trigger === 'manual' && l[2].result === 'error'));
});

test('sale ignores historical rules and sells special products but not locked inventory', async () => {
    const f = fixture(); f.enable('autoSell');
    f.setPolicy({ sellItemIds: [], sellKeepCount: 99999, sellMaxPerRun: 1 });
    f.items[0].count = '120000';
    f.items[0].item_detail = { ranch_product: { weight_x10: 100 } };
    f.items[0].mutant_types = [1];
    f.items[1].is_locked = true;
    await f.service.runAutomation(); await f.service.runAutomation();
    const sales = f.calls.filter(c => c.method === 'Sell');
    assert.equal(sales.length, 1);
    assert.deepEqual(sales[0].params.items, [{ id: '2060001', uid: '9007199254740995', count: '120000' }]);
    assert.equal(f.items[1].count, '40');
});

test('can filling honors reserve, per-run cap and independent bucket targets', async () => {
    const f = fixture(); f.enable('autoUseCan'); f.setPolicy({ canItemIds: ['80021', '80031'], canReserveCount: 10, canMaxPerRun: 2, bucketTargetSeconds: 3600 });
    await f.service.runAutomation(); await f.service.runAutomation();
    const calls = f.calls.filter(c => c.method === 'BatchUse'); assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(c => c.params.items[0].count), ['1', '1']);
    assert.equal(f.calls.some(c => c.method === 'BuyGoods' || c.method === 'FeedAnimal'), false);
});

test('automatic feed uses inventory and capacity/target/reserve, never use_gold', async () => {
    const f = fixture(); f.enable('autoAddFeed'); f.setPolicy({ feedTargetCount: 200, feedReserveCount: 900 });
    await f.service.runAutomation(); await f.service.runAutomation();
    const adds = f.calls.filter(c => c.method === 'AddFeed'); assert.equal(adds.length, 1);
    assert.equal(adds[0].params.add_count, 100); assert.equal(adds[0].params.use_gold, false);
});

test('automatic placement buys compatible whitelist cubs with auto_add, at most one per pen/run', async () => {
    const f = fixture(); f.enable('autoPlace'); f.setPolicy({ cubItemIds: ['60001'] });
    await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'BuyGoods' && c.params.auto_add).length, 1);
    assert.equal(f.calls.find(c => c.method === 'BuyGoods').params.auto_add, true);
});

test('gold-ticket purchase fills target stock without spending reserve or enabling auto_add', async () => {
    const f = fixture(); f.enable('autoBuy'); f.setPolicy({ buyRules: [{ goodsId: '10001', targetStock: 1002, maxPerRun: 2, maxUnitPrice: 60 }], goldReserve: 99880 });
    await f.service.runAutomation(); await f.service.runAutomation();
    const buys = f.calls.filter(c => c.method === 'BuyGoods'); assert.equal(buys.length, 1);
    assert.equal(buys[0].params.num, '2'); assert.equal(buys[0].params.auto_add, false);
});

test('rotation exchange fills target with safe currency and quoted round, then stops', async () => {
    const f = fixture(); f.enable('autoExchange'); f.setPolicy({ exchangeRules: [{ goodsId: '101', itemId: '7001', costItemId: '7002', targetStock: 1020, maxPerRun: 2, maxUnitPrice: 5 }], poopReserve: 990 });
    await f.service.runAutomation(); await f.service.runAutomation();
    const buys = f.calls.filter(c => c.method === 'RotationBuyGoods'); assert.equal(buys.length, 1);
    assert.deepEqual(buys[0].params, { goods_id: '101', count: 2, period_day: '20261116', round_index: 1 });
});

test('merchant max price, balances, paid currency and missing rules all fail closed', async () => {
    for (const mode of ['buy', 'exchange']) {
        const f = fixture(); f.enable(mode === 'buy' ? 'autoBuy' : 'autoExchange');
        f.setPolicy({ [mode === 'buy' ? 'buyRules' : 'exchangeRules']: [{ goodsId: mode === 'buy' ? '10001' : '101', ...(mode === 'exchange' ? { itemId: '7001', costItemId: '7002' } : {}), targetStock: 1100, maxPerRun: 2, maxUnitPrice: 1 }] });
        await f.service.runAutomation(); assert.equal(f.calls.some(c => c.method === 'BuyGoods' || c.method === 'RotationBuyGoods'), false);
    }
    const f = fixture(); f.enable('autoExchange'); f.setPolicy({ exchangeRules: [{ goodsId: '101', itemId: '7001', costItemId: '7002', targetStock: 1100, maxPerRun: 2, maxUnitPrice: 5 }] });
    f.overrides.RotationShopInfo = () => ({ opened: true, present: true, goods: [{ goods_id: '101', item_id: '7001', item_count: '1', cost_item_id: '1002', cost_count: '1' }] });
    await f.service.runAutomation(); assert.equal(f.calls.some(c => c.method === 'RotationBuyGoods'), false);
});

test('switch-off and policy changes during awaited reads are rechecked immediately before mutation', async () => {
    const f = fixture(); f.enable('autoSell'); f.setPolicy({ sellItemIds: ['2060001'], sellKeepCount: 0 });
    f.overrides.GetBag = () => { f.automation.ranch_auto_sell = false; return f.responses('GetBag', {}); };
    await assert.rejects(f.service.action({ action: 'sell', itemId: '2060001', uid: '9007199254740995', count: 1 }, 'autoSell'), /已关闭/);
    assert.equal(f.calls.some(c => c.method === 'Sell'), false);
    f.enable('autoSell'); f.overrides.GetBag = () => { f.setPolicy({ sellKeepCount: 30 }); return f.responses('GetBag', {}); };
    await f.service.action({ action: 'sell', itemId: '2060001', uid: '9007199254740995', count: 1 }, 'autoSell');
});

test('concurrent automation triggers are deduplicated and extended action budget is enforced', async () => {
    const f = fixture(); f.enable('autoSteal', 'autoHelp', 'autoStroke', 'autoPutHazard'); f.setPolicy({ maxActionsPerRun: 1 });
    await Promise.all([f.service.runAutomation(), f.service.runAutomation()]);
    assert.deepEqual(f.calls.filter(c => MUTATIONS.has(c.method)).map(c => c.method), ['StealProduce']);
    await f.service.runAutomation();
    assert.deepEqual(f.calls.filter(c => MUTATIONS.has(c.method)).map(c => c.method), ['StealProduce', 'CleanAllRanch']);
});

test('strict policies reject malformed IDs, negative limits, duplicates and unbounded merchant rules', () => {
    for (const p of [{ friendExcludeGids: ['x'] }, { sellKeepCount: -1 }, { maxActionsPerRun: 0 }, { bad: true }, { buyRules: [{ goodsId: '10001' }] }, { exchangeRules: [{ goodsId: '101', itemId: '7001', costItemId: '7002', targetStock: 1, maxPerRun: 100, maxUnitPrice: 1 }] }]) assert.throws(() => normalizePolicy(p, true), /无效牧场策略/);
    assert.deepEqual(normalizePolicy({ canItemIds: [80021] }).canItemIds, []);
});

test('policy persistence preserves arrays/numbers, strict booleans and account isolation', () => {
    const store = require('../src/models/store');
    const p = normalizePolicy({ sellItemIds: ['2060001'], sellKeepCount: 25 }, true);
    const a = store.applyConfigSnapshot({ automation: { ranch_policy: p, ranch_auto_sell: true } }, { persist: false, accountId: '__ranch_auto_a__' });
    const b = store.applyConfigSnapshot({ automation: { ranch_auto_sell: 'true' } }, { persist: false, accountId: '__ranch_auto_b__' });
    assert.equal(a.automation.ranch_policy.sellKeepCount, 25);
    assert.deepEqual(a.automation.ranch_policy.sellItemIds, ['2060001']);
    assert.deepEqual(b.automation.ranch_policy.sellItemIds, []);
    assert.equal(b.automation.ranch_auto_sell, false);
});

test('friend cursor advances by actual visited friends when action budget truncates a batch', async () => {
    const f = fixture(); f.enable('autoPutHazard'); f.setPolicy({ friendBatchSize: 3, maxActionsPerRun: 1 });
    f.setFriends(['456', '457', '458', '459'].map(gid => ({ gid })));
    // A resumed slice may finish inspecting a prior friend before advancing the batch.
    for (let i = 0; i < 8; i++) await f.service.runAutomation();
    assert.deepEqual(f.calls.filter(c => c.method === 'PutHazard').map(c => c.params.host_gid).slice(0, 4), ['456', '457', '458', '459']);
});

test('auto sale is independent of historical exchange item rules', async () => {
    const f = fixture(); f.enable('autoSell', 'autoExchange');
    f.setPolicy({ sellItemIds: ['2060001'], sellKeepCount: 0, exchangeRules: [{ goodsId: '101', itemId: '2060001', costItemId: '7002', targetStock: 30, maxPerRun: 1, maxUnitPrice: 5 }] });
    f.overrides.RotationShopInfo = () => ({ opened: true, present: true, period_day: '20261116', round_index: 1, goods: [{ goods_id: '101', item_id: '2060001', item_count: '1', cost_item_id: '7002', cost_count: '5' }] });
    await f.service.runAutomation();
    assert.equal(f.calls.some(c => c.method === 'Sell'), true);
    assert.equal(f.calls.some(c => c.method === 'RotationBuyGoods'), false);
});

test('rotation reuse cannot exchange a different item or currency even when goods ID and price match', async () => {
    for (const patch of [{ item_id: '60001' }, { cost_item_id: '1008' }]) {
        const f = fixture(); f.enable('autoExchange');
        f.setPolicy({ exchangeRules: [{ goodsId: '101', itemId: '7001', costItemId: '7002', targetStock: 1100, maxPerRun: 1, maxUnitPrice: 5 }] });
        f.overrides.RotationShopInfo = () => ({ opened: true, present: true, period_day: '20261117', round_index: 2, goods: [{ goods_id: '101', item_id: '7001', item_count: '1', cost_item_id: '7002', cost_count: '5', ...patch }] });
        await f.service.runAutomation();
        assert.equal(f.calls.some(c => c.method === 'RotationBuyGoods'), false);
    }
});

test('connection reset stops the remaining old automation round even if gid remains present', async () => {
    const f = fixture(); f.enable('autoSell', 'autoUseCan'); f.setPolicy({ sellItemIds: ['2060001'], canItemIds: ['80021'] });
    f.overrides.Sell = params => { const result = f.responses('Sell', params); f.session.reset(); return result; };
    await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'Sell').length, 1);
    assert.equal(f.calls.filter(c => c.method === 'BatchUse').length, 0);
});

test('failed friend leave from an old connection cannot poison a newly reset connection', async () => {
    const f = fixture(); f.overrides.LeaveHomestead = new Error('connection lost');
    const result = await f.service.action({ action: 'steal', hostGid: '456', ranchId: '10001', slotIndex: 0 });
    assert.match(result.warning, /退出好友牧场失败/);
    const before = f.calls.length;
    f.session.reset(); await f.service.getStatus();
    assert.equal(f.calls.slice(before).some(c => c.method === 'LeaveHomestead'), false);
});


test('simple currency opt-ins exchange without rules and never spend another currency', async () => {
    const f = fixture(); f.enable('autoExchangePoop');
    await f.service.runAutomation();
    const buy = f.calls.find(c => c.method === 'RotationBuyGoods');
    assert.equal(buy.params.count, 10);
    assert.equal(f.calls.some(c => c.method === 'BuyGoods'), false);
    const other = fixture(); other.enable('autoExchangePine');
    await other.service.runAutomation();
    assert.equal(other.calls.some(c => c.method === 'RotationBuyGoods'), false);
});

test('currency switch is rechecked before mutation and paid currencies remain rejected', async () => {
    for (const currency of ['1007', '1009']) {
        const f = fixture(); f.enable('autoExchangePoop', 'autoExchangePine');
        f.overrides.RotationShopInfo = () => ({ ...f.responses('RotationShopInfo'), goods: [{ goods_id: '101', item_id: '7001', item_count: '1', cost_item_id: currency, cost_count: '1', limit_count: '10' }] });
        await f.service.runAutomation();
        assert.equal(f.calls.some(c => c.method === 'RotationBuyGoods'), false);
    }
    const f = fixture(); f.enable('autoExchangePoop');
    f.overrides.GetBag = params => { f.automation.ranch_auto_exchange_poop = false; return f.responses('GetBag', params); };
    await f.service.runAutomation();
    assert.equal(f.calls.some(c => c.method === 'RotationBuyGoods'), false);
});

test('simple mode expands safe existing inventory choices, not legacy shopping rules', () => {
    const p = normalizePolicy({ mode: 'simple' }, true);
    assert.ok(p.sellItemIds.length && p.canItemIds.length && p.cubItemIds.length);
    assert.equal(p.sellKeepCount, 0);
    assert.deepEqual(p.buyRules, []);
    assert.deepEqual(p.exchangeRules, []);
    assert.throws(() => normalizePolicy({ farmMin: 10, farmMax: 2 }, true));
    assert.throws(() => normalizePolicy({ husbandryStrategy: 'invented' }, true));
    assert.throws(() => normalizePolicy({ quietStart: '25:00' }, true));
});

test('simple selling and placement work without item whitelist configuration', async () => {
    const f = fixture(); f.setPolicy({ mode: 'simple' }); f.enable('autoSell', 'autoPlace');
    await f.service.runAutomation();
    assert.ok(f.calls.some(c => c.method === 'Sell'));
    assert.ok(f.calls.some(c => c.method === 'BuyGoods' && c.params.auto_add));
});

test('can strategy executes the shared feed action with existing container only', async () => {
    const f = fixture(); f.enable('autoFeedAnimal'); f.setPolicy({ canStrategy: 'normal' });
    f.own.animals = [{ animal_inst_id: 17, animal_id: '60001', stage: 2, can_feed: true }];
    f.items.find(i => i.id === '7004').count = '60';
    f.overrides.FeedAnimal = () => ({});
    await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'FeedAnimal').length, 1);
    assert.equal(f.calls.find(c => c.method === 'FeedAnimal').params.bucket_type, 1);
    assert.equal(f.calls.some(c => c.method === 'BuyGoods'), false);
});

test('ranch and facility upgrades are separate opt-ins and use shared paid-resource checks', async () => {
    for (const [key, expected] of [['autoUpgradeRanch', true], ['autoUpgradeFacilities', false]]) {
        const f = fixture(); f.enable(key);
        f.overrides.AllCells = () => ({ facilities: [{ instance_id: '11', facility_id: 1001001, level: 1 }] });
        f.overrides.GetFacilityDetail = () => ({ info: { upgrade_cost: [{ id: '1007', count: '11000' }] } });
        f.overrides.UpgradeBuilding = () => ({});
        await f.service.runAutomation();
        assert.equal(f.calls.some(c => c.method === 'UpgradeBuilding'), expected);
    }
    const f = fixture(); f.enable('autoUpgradeRanch');
    f.overrides.AllCells = () => ({ facilities: [{ instance_id: '11', facility_id: 1001001, level: 1 }] });
    f.overrides.GetFacilityDetail = () => ({ info: { upgrade_cost: [{ id: '1009', count: '1' }] } });
    await f.service.runAutomation();
    assert.equal(f.calls.some(c => c.method === 'UpgradeBuilding'), false);
});

test('production scheduler groups really isolate help, stealing and own-ranch work', async () => {
    const help = fixture(); help.enable('autoHelp', 'autoStroke', 'autoSteal', 'autoAddFeed');
    await help.service.runAutomation('help');
    assert.ok(help.calls.some(c => c.method === 'CleanAllRanch'));
    assert.ok(help.calls.some(c => c.method === 'StrokeAnimal'));
    assert.equal(help.calls.some(c => ['StealProduce', 'AddFeed'].includes(c.method)), false);
    const steal = fixture(); steal.enable('autoHelp', 'autoStroke', 'autoSteal', 'autoAddFeed');
    await steal.service.runAutomation('steal');
    assert.ok(steal.calls.some(c => c.method === 'StealProduce'));
    assert.equal(steal.calls.some(c => ['CleanAllRanch', 'StrokeAnimal', 'AddFeed'].includes(c.method)), false);
    const own = fixture(); own.enable('autoHelp', 'autoSteal', 'autoAddFeed');
    own.setPolicy({ feedTargetCount: 200, feedReserveCount: 0 });
    await own.service.runAutomation('farm');
    assert.ok(own.calls.some(c => c.method === 'AddFeed'));
    assert.equal(own.calls.some(c => ['EnterHomestead', 'GetAll', 'StealProduce', 'CleanAllRanch'].includes(c.method)), false);
});


test('worker tick wakes at known production deadline without polling friends early', async () => {
    let time = 1800000000000;
    const f = fixture(() => time); f.enable('autoSteal'); f.setPolicy({ mode: 'simple' });
    f.friend.shelves = [];
    f.friend.animals[0].producing = true;
    f.friend.animals[0].produce_ready_at_ms = time + 2000;
    await f.service.tickAutomation();
    const visits = () => f.calls.filter(c => c.method === 'EnterHomestead').length;
    assert.equal(visits(), 1);
    assert.equal(f.service.getAutomationSchedule().steal.nextAt, time + 2000);
    time += 1000; await f.service.tickAutomation();
    assert.equal(visits(), 1);
    time += 1000; await f.service.tickAutomation();
    assert.equal(visits(), 2);
    f.session.reset(); await f.service.tickAutomation();
    assert.equal(visits(), 3);
});

test('simple highest-level placement buys without any cub inventory', async () => {
    const f = fixture(); f.setPolicy({ mode: 'simple' }); f.enable('autoPlace');
    f.items.find(i => i.id === '60001').count = '0';
    f.overrides.ShopInfo = params => ({ goods_list: params.shop_id === 5 ? [{ id: '10002', price: '2', unlocked: true }, { id: '10003', price: '1080', unlocked: true }] : [] });
    await f.service.runAutomation();
    assert.deepEqual(f.calls.find(c => c.method === 'BuyGoods').params, { goods_id: '10003', num: '1', price: '1080', auto_add: true });
});
test('placement refuses insufficient gold, reserve breach, locked goods and full pen', async () => {
    for (const scenario of ['gold', 'reserve', 'locked', 'full']) {
        const f = fixture(); f.setPolicy({ mode: 'simple' }); f.enable('autoPlace');
        if (scenario === 'gold') f.items.find(i => i.id === '1007').count = '0';
        if (scenario === 'reserve') f.items.find(i => i.id === '1007').count = '10000';
        if (scenario === 'locked') f.overrides.ShopInfo = () => ({ goods_list: [{ id: '10002', price: '2', unlocked: false }] });
        if (scenario === 'full') f.own.animal_count = 3;
        await f.service.runAutomation();
        assert.equal(f.calls.some(c => c.method === 'BuyGoods'), false, scenario);
    }
});

test('budget slices resume tail actions without replaying completed head writes', async () => {
    const f = fixture();
    f.enable('autoClean', 'autoAddFeed');
    f.own.hazards = [{ hazard_id: '1' }];
    f.session.shouldYield = () => true; // persistent farm/manual pressure and slow reads
    const first = await f.service.runAutomation('farm');
    assert.equal(first.status, 'yielded');
    assert.equal(f.calls.filter(c => c.method === 'CleanRanch').length, 1);
    await f.service.runAutomation('farm');
    assert.equal(f.calls.filter(c => c.method === 'CleanRanch').length, 1);
    assert.equal(f.calls.filter(c => c.method === 'AddFeed').length, 1);
    assert.equal(f.calls.some(c => c.method === 'GetBagTab'), false);
    assert.equal(f.calls.some(c => c.method === 'GetOrderPanel'), false);
});

test('continuation is discarded after reset and disabled switches never resume writes', async () => {
    const f = fixture(); f.enable('autoClean', 'autoAddFeed');
    f.own.hazards = [{ hazard_id: '1' }]; f.session.shouldYield = () => true;
    await f.service.runAutomation('farm');
    f.automation[SETTINGS_KEYS.autoAddFeed] = false;
    f.session.reset();
    await f.service.runAutomation('farm');
    assert.equal(f.calls.filter(c => c.method === 'AddFeed').length, 0);
    assert.equal(f.calls.filter(c => c.method === 'CleanRanch').length, 2);
});

test('pending friend actions survive yield after the first interaction', async () => {
    const f = fixture(); f.enable('autoHelp', 'autoStroke', 'autoPutHazard');
    f.session.shouldYield = () => true;
    for (let i = 0; i < 6; i++) await f.service.runAutomation('help');
    for (const method of ['CleanAllRanch', 'StrokeAnimal', 'PutHazard']) assert.ok(f.calls.some(c => c.method === method), method);
    assert.equal(f.calls.filter(c => c.method === 'EnterHomestead').length, f.calls.filter(c => c.method === 'LeaveHomestead').length);
});

test('own animal deadline uses server clock delta rather than local wall time', async () => {
    let now = 100000;
    const f = fixture(() => now, () => now + 900000);
    f.enable('autoCollect'); f.setPolicy({ farmMin: 60, farmMax: 60 });
    f.own.animals = [{ animal_inst_id: 1, animal_id: '60001', infant_ready_at_ms: 1003000 }];
    await f.service.tickAutomation();
    assert.equal(f.service.getAutomationSchedule().farm.nextAt, 103000);
    now += 1000;
    await f.service.tickAutomation();
    assert.equal(f.service.getAutomationSchedule().farm.nextAt, 103000);
});

test('unchanged inventory strategies share one light snapshot within a slice', async () => {
    const f = fixture(); f.enable('autoSell');
    f.items[0].is_locked = true; f.items[1].is_locked = true;
    f.setPolicy({ sellItemIds: ['2060001', '1060004'], sellKeepCount: 99999 });
    await f.service.runAutomation('farm');
    assert.equal(f.calls.filter(c => c.method === 'AllCells').length, 1);
    assert.equal(f.calls.filter(c => c.method === 'GetBag').length, 1);
    assert.equal(f.calls.filter(c => c.method === 'GetBagTab').length, 0);
});

test('a definitively blocked ranch scene stops automation ticks without touching RPC', async () => {
    const f = fixture(); f.enable('autoCollect');
    f.session.snapshot = () => ({ blockedScenes: ['ranch'] });
    await f.service.tickAutomation(); await f.service.tickAutomation();
    assert.equal(f.calls.length, 0);
});

test('own feed uses zero host sentinel, not the logged-in gid (official watchGid semantics)', async () => {
    const f = fixture(); f.enable('autoAddFeed');
    f.overrides.AddFeed = params => {
        if (String(params.host_gid || '0') !== '0') throw Error('code=1045108 只有牧场主人才能进行此操作');
        return f.responses('AddFeed', params);
    };
    await f.service.runAutomation('farm');
    const calls = f.calls.filter(c => c.method === 'AddFeed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].params.host_gid, '0');
    assert.equal(f.logs.some(args => String(args[1]).includes('1045108')), false);
    assert.equal(f.session.snapshot().blockedScenes.length, 0);
});

test('all ranch facility upgrades use next-level ranch thresholds and gold-ticket budget', async () => {
    const config = require('../src/gameConfig/RanchConfig.json');
    const levels = require('../src/gameConfig/RanchLevel.json');
    const rows = config.MCFacilityConfig;
    for (const current of rows.filter(row => row.next_facility_id)) {
        const next = rows.find(row => row.facility_id === current.next_facility_id);
        const required = Number(next.upgrade_conditions?.split(':')[1] || 1);
        const cost = next.upgrade_cost.split(':')[1];
        for (const allowed of [false, true]) {
            const f = fixture(); f.enable(current.module_type === 'MODULE_TYPE_MAIN_CITY' ? 'autoUpgradeRanch' : 'autoUpgradeFacilities');
            const exp = levels.find(row => row.level === required)?.exp;
            assert.notEqual(exp, undefined);
            f.items.push({ id: '1102', count: String(allowed || required === 1 ? exp : exp - 1) });
            f.items.find(i => i.id === '1007').count = String(BigInt(cost) - (!allowed && required === 1 ? 1n : 0n));
            f.overrides.AllCells = () => ({ facilities: [{ instance_id: '11', facility_id: current.facility_id }] });
            f.overrides.GetFacilityDetail = () => ({ info: { upgrade_cost: [{ id: '1007', count: cost }] } });
            f.overrides.UpgradeBuilding = () => ({});
            await f.service.runAutomation();
            assert.equal(f.calls.some(c => c.method === 'UpgradeBuilding'), allowed, `${current.facility_id} -> ${next.facility_id}`);
            assert.equal(f.calls.some(c => c.method === 'BatchGetBasicInfo'), false);
            if (!allowed) assert.equal(f.calls.some(c => c.method === 'GetFacilityDetail'), false);
        }
    }
});

test('feed machine upgrade fails closed for missing experience and insufficient or locked money', async () => {
    for (const [exp, count, locked] of [[null, '62000', false], ['bad', '62000', false], ['141400', '61999', false], ['141400', '62000', true]]) {
        const f = fixture(); f.enable('autoUpgradeFacilities');
        if (exp !== null) f.items.push({ id: '1102', count: exp });
        Object.assign(f.items.find(i => i.id === '1007'), { count, locked });
        f.overrides.AllCells = () => ({ facilities: [{ instance_id: '11', facility_id: 7001002 }] });
        await f.service.runAutomation();
        assert.equal(f.calls.some(c => ['GetFacilityDetail', 'UpgradeBuilding', 'BatchGetBasicInfo'].includes(c.method)), false);
    }
});

test('autoSteal helps friend produce then steals newly available shelves in same run', async () => {
    const f = fixture(); f.enable('autoSteal');
    Object.assign(f.friend.animals[0], { stage: 3, producing: false, can_deliver: true });
    f.friend.shelves[0].can_steal = false;
    f.overrides.TriggerProduce = params => {
        assert.equal(params.host_gid, '456');
        assert.deepEqual(params.targets, [{ ranch_inst_id: '10001', animal_inst_id: 35 }]);
        f.friend.animals[0].producing = true;
        f.friend.shelves[0].can_steal = true;
        return {};
    };
    await f.service.runAutomation();
    assert.deepEqual(f.calls.filter(c => ['TriggerProduce', 'StealProduce'].includes(c.method)).map(c => c.method), ['TriggerProduce', 'StealProduce']);
});

test('friend production obeys autoSteal opt-in, live readiness and action budget', async () => {
    for (const mode of ['off', 'unready', 'limit']) {
        const f = fixture();
        Object.assign(f.friend.animals[0], { stage: 3, producing: false, can_deliver: mode !== 'unready' });
        f.friend.shelves[0].can_steal = false;
        if (mode !== 'off') f.enable('autoSteal');
        if (mode === 'limit') f.setPolicy({ maxActionsPerRun: 1 });
        f.overrides.TriggerProduce = () => { f.friend.shelves[0].can_steal = true; return {}; };
        await f.service.runAutomation();
        assert.equal(f.calls.filter(c => c.method === 'TriggerProduce').length, mode === 'limit' ? 1 : 0);
        assert.equal(f.calls.some(c => c.method === 'StealProduce'), false);
    }
});

test('failed friend production never fabricates stealable shelves', async () => {
    const f = fixture(); f.enable('autoSteal');
    Object.assign(f.friend.animals[0], { stage: 3, producing: false, can_deliver: true });
    f.friend.shelves[0].can_steal = false;
    f.overrides.TriggerProduce = new Error('production refused');
    await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'TriggerProduce').length, 1);
    assert.equal(f.calls.some(c => c.method === 'StealProduce'), false);
    assert.equal(f.calls.filter(c => c.method === 'EnterHomestead').length, f.calls.filter(c => c.method === 'LeaveHomestead').length);
});

test('automatic hazards skip exhausted, missing and malformed quota without blocking help', async () => {
    for (const ops of [[], [{ op_id: '11003', remaining_times: '0' }], [{ op_id: '11003', remaining_times: '-1' }]]) {
        const f = fixture(); f.enable('autoPutHazard', 'autoHelp');
        f.overrides.GetRanchOpTimes = () => ({ ops });
        await f.service.runAutomation();
        assert.equal(f.calls.some(c => c.method === 'PutHazard'), false);
        assert.equal(f.calls.some(c => c.method === 'CleanAllRanch'), true);
        assert.equal(f.logs.some(l => l[2]?.event === 'putHazard' && l[2]?.result === 'error'), false);
    }
});

test('automatic hazards still execute when quota is positive', async () => {
    const f = fixture(); f.enable('autoPutHazard');
    await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'PutHazard').length, 1);
});

test('bag priority places inventory without shop lookup or gold spending', async () => {
    const f = fixture(); f.setPolicy({ mode: 'simple', husbandryStrategy: 'bag_priority', husbandryFallbackStrategy: 'max_exp' }); f.enable('autoPlace');
    f.items.find(i => i.id === '1007').count = '0';
    f.overrides.ShopInfo = new Error('bag placement must not query shop');
    await f.service.runAutomation();
    const call = f.calls.find(c => c.method === 'PlaceAnimal');
    assert.deepEqual(call?.params, { items: [{ ranch_inst_id: '9007199254740993', animal_id: '60001' }] });
    assert.equal(f.calls.some(c => c.method === 'BuyGoods' || c.method === 'ShopInfo'), false);
});
test('bag priority falls back to selected purchase strategy when inventory is empty or locked', async () => {
    for (const locked of [false, true]) {
        const f = fixture(); f.setPolicy({ mode: 'simple', husbandryStrategy: 'bag_priority', husbandryFallbackStrategy: 'level' }); f.enable('autoPlace');
        const item = f.items.find(i => i.id === '60001');
        if (locked) item.locked = true;
        else item.count = '0';
        f.overrides.ShopInfo = () => ({ goods_list: [{ id: '10003', price: '1080', unlocked: true }] });
        await f.service.runAutomation();
        assert.equal(f.calls.find(c => c.method === 'BuyGoods')?.params.goods_id, '10003');
        assert.equal(f.calls.some(c => c.method === 'PlaceAnimal'), false);
    }
});
test('fallback policy persists and rejects recursive or unknown strategies', () => {
    const p = normalizePolicy({ husbandryStrategy: 'bag_priority', husbandryFallbackStrategy: 'max_profit' }, true);
    assert.equal(p.husbandryFallbackStrategy, 'max_profit');
    assert.equal(normalizePolicy({}).husbandryFallbackStrategy, 'level');
    assert.throws(() => normalizePolicy({ husbandryFallbackStrategy: 'bag_priority' }, true));
});


test('simple sale batches all eligible products and ignores historical ten-item cap', async () => {
    const f = fixture(); f.enable('autoSell');
    f.setPolicy({ mode: 'simple', sellMaxPerRun: 10 });
    await f.service.runAutomation();
    const sales = f.calls.filter(c => c.method === 'Sell');
    assert.equal(sales.length, 1);
    assert.deepEqual([...sales[0].params.items].sort((a, b) => b.id.localeCompare(a.id)), [
        { id: '2060001', uid: '9007199254740995', count: '30' },
        { id: '1060004', uid: '12', count: '40' },
    ]);
    assert.equal(f.items[0].count, '0');
    assert.equal(f.items[1].count, '0');
});

test('uncertain friend timeout stops the batch instead of cancelling every remaining friend', async () => {
    const { runRanchExtraAutomation } = require('../src/services/ranch-automation');
    for (const code of ['REQUEST_TIMEOUT', 'ENCODE_TIMEOUT', 'CONNECTION_CLOSED', 'SCENE_CANCELLED']) {
        const visits = [], errors = [];
        await runRanchExtraAutomation({
            service: {
                getResource: async () => ({ friends: [{ gid: '1' }, { gid: '2' }, { gid: '3' }] }),
                action: async input => {
                    visits.push(input.hostGid);
                    throw Object.assign(new Error('GetRanchDetail timeout'), { code });
                },
            },
            attempt: async () => {}, settings: () => ({ autoPutHazard: true }),
            policy: () => normalizePolicy(), alive: () => true, goodsMap: new Map(),
            getCursor: () => 0, setCursor() {}, logError: err => errors.push(err),
        });
        assert.deepEqual(visits, ['1'], code);
        assert.equal(errors.length, 1, code);
    }
});

test('uncertain extra automation read stops all later inventory and friend chains', async () => {
    const { runRanchExtraAutomation } = require('../src/services/ranch-automation');
    for (const code of ['REQUEST_TIMEOUT', 'ENCODE_TIMEOUT', 'CONNECTION_CLOSED', 'SCENE_CANCELLED']) {
        const reads = [], errors = [];
        await runRanchExtraAutomation({
            service: {
                getStatus: async () => {
                    reads.push('status');
                    throw Object.assign(new Error('uncertain inventory read'), { code });
                },
                getResource: async resource => { reads.push(resource); return { friends: [] }; },
            },
            attempt: async () => assert.fail('must not perform after uncertain read'),
            settings: () => ({ autoAddFeed: true, autoSell: true, autoSteal: true }),
            policy: () => normalizePolicy(), alive: () => true, goodsMap: new Map(),
            getCursor: () => 0, setCursor() {}, logError: err => errors.push(err),
        });
        assert.deepEqual(reads, ['status'], code);
        assert.equal(errors.length, 1, code);
    }
});

test('invalid lease ends automation without attempting remaining friend actions', async () => {
    const f = fixture(); f.enable('autoSteal', 'autoStroke');
    f.setFriends([{ gid: '456' }, { gid: '457' }, { gid: '458' }]);
    const assertAllowed = f.session.assertAllowed;
    let invalid = false;
    f.session.assertAllowed = () => {
        if (invalid) throw Object.assign(new Error('failed lease'), { code: 'SCENE_CANCELLED' });
        assertAllowed();
    };
    f.overrides.StealProduce = () => { invalid = true; throw new Error('write failed'); };
    await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'StealProduce').length, 1);
    assert.equal(f.calls.some(c => c.method === 'StrokeAnimal'), false);
    assert.deepEqual(f.calls.filter(c => c.method === 'EnterHomestead').map(c => c.params.host_gid), ['456', '456']);
    assert.equal(f.logs.filter(l => l[2].result === 'error').length, 1);
});

test('grass fill skips before any write when the fill ratio already reaches the threshold', async () => {
    const f = fixture(); f.enable('autoAddFeed');
    f.setPolicy({ grassThresholdPercent: 20 });
    // 30% filled > 20% threshold → nothing to do.
    f.overrides.AllCells = () => ({ facilities: [{ instance_id: '9', facility_id: 6001001, ranch: f.own }, { instance_id: '10', facility_id: 1, capacity: 1000, feed_machine: { feed_count: 300 } }] });
    await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'AddFeed').length, 0);
});

test('grass fill below the threshold tops the machine up to capacity, not to the threshold', async () => {
    const f = fixture(); f.enable('autoAddFeed');
    f.setPolicy({ grassThresholdPercent: 20, feedTargetCount: 200, feedReserveCount: 0 });
    await f.service.runAutomation();
    const adds = f.calls.filter(c => c.method === 'AddFeed');
    assert.equal(adds.length, 1);
    // capacity 1000 with 20 already in it: the threshold decides whether to act,
    // the amount still fills the machine to capacity (bounded by the target).
    assert.equal(adds[0].params.add_count, 180);
    assert.equal(adds[0].params.use_gold, false);
});

test('grass threshold is a validated integer percentage that defaults to 20', () => {
    assert.equal(normalizePolicy({}).grassThresholdPercent, 20);
    assert.equal(normalizePolicy({ grassThresholdPercent: 35 }).grassThresholdPercent, 35);
    assert.equal(normalizePolicy({ grassThresholdPercent: 1 }).grassThresholdPercent, 1);
    assert.equal(normalizePolicy({ grassThresholdPercent: 100 }).grassThresholdPercent, 100);
    for (const invalid of [0, 101, 20.5, -1]) {
        assert.throws(() => normalizePolicy({ grassThresholdPercent: invalid }, true), /grassThresholdPercent/);
    }
    // null/undefined mean "not provided", so the default applies instead of failing.
    assert.equal(normalizePolicy({ grassThresholdPercent: null }, true).grassThresholdPercent, 20);
    assert.equal(normalizePolicy({ grassThresholdPercent: 101 }).grassThresholdPercent, 20);
});

test('poop exchange redeems the 4-hour organic fertilizer before the 1-hour one when the opt-in is on', async () => {
    const f = fixture(); f.enable('autoExchangePoop', 'autoExchangeOrganicFirst');
    f.overrides.RotationShopInfo = () => ({
        opened: true, present: true, period_day: '20261116', round_index: 1,
        goods: [
            { goods_id: '201', item_id: '80011', item_count: '1', cost_item_id: '7002', cost_count: '5', limit_count: '10', limit_used: '0' },
            { goods_id: '202', item_id: '80012', item_count: '1', cost_item_id: '7002', cost_count: '8', limit_count: '10', limit_used: '0' },
            { goods_id: '203', item_id: '1012', item_count: '1', cost_item_id: '7002', cost_count: '5', limit_count: '10', limit_used: '0' },
        ],
    });
    f.overrides.RotationBuyGoods = () => ({});
    await f.service.runAutomation();
    const buys = f.calls.filter(c => c.method === 'RotationBuyGoods').map(c => String(c.params.goods_id));
    assert.ok(buys.length > 0);
    assert.equal(buys[0], '202');
    assert.ok(buys.indexOf('201') === -1 || buys.indexOf('201') > 0);
});

test('poop exchange keeps the market order when the organic-first opt-in is off', async () => {
    const f = fixture(); f.enable('autoExchangePoop');
    f.overrides.RotationShopInfo = () => ({
        opened: true, present: true, period_day: '20261116', round_index: 1,
        goods: [
            { goods_id: '201', item_id: '80011', item_count: '1', cost_item_id: '7002', cost_count: '5', limit_count: '10', limit_used: '0' },
            { goods_id: '202', item_id: '80012', item_count: '1', cost_item_id: '7002', cost_count: '8', limit_count: '10', limit_used: '0' },
        ],
    });
    f.overrides.RotationBuyGoods = () => ({});
    await f.service.runAutomation();
    const buys = f.calls.filter(c => c.method === 'RotationBuyGoods').map(c => String(c.params.goods_id));
    assert.ok(buys.length > 0);
    assert.equal(buys[0], '201');
});

test('poop exchange never spends pine stock while only the poop opt-in is enabled', async () => {
    const f = fixture(); f.enable('autoExchangePoop');
    f.overrides.RotationShopInfo = () => ({
        opened: true, present: true, period_day: '20261116', round_index: 1,
        goods: [{ goods_id: '301', item_id: '80012', item_count: '1', cost_item_id: '1008', cost_count: '5', limit_count: '10', limit_used: '0' }],
    });
    f.overrides.RotationBuyGoods = () => ({});
    await f.service.runAutomation();
    assert.equal(f.calls.some(c => c.method === 'RotationBuyGoods'), false);
});
