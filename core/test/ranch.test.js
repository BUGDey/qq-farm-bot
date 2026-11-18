const test = require('node:test');
const assert = require('node:assert/strict');
const { createRanchService, normalizeSettings } = require('../src/services/ranch');
const { createRanchSession } = require('../src/services/ranch-session');
function fixture(options = {}) {
    const calls = [];
    const session = createRanchSession();
    const automation = { ranch_auto_collect: false, ranch_auto_clean: false };
    const ranch = { husbandry_type: 1, animal_count: 1, ranch_inst_id: '9007199254740993', capacity: 3, animals: [{ animal_id: '60001', animal_inst_id: 1, stage: 3, can_deliver: true, producing: false, can_harvest: false }], shelves: [{ slot_index: 0, can_collect: true, lots: [{ item_id: '2060001', remain_num: '2' }] }], hazards: [{ hazard_id: '888', hazard_type: 1 }] };
    const responses = {
        GetPlayerSceneInfo: { unlocked_scenes: [1, 2] },
        PlayerSceneLogin: {},
        AllCells: { grid_width: 10, grid_height: 10, facilities: [{ instance_id: ranch.ranch_inst_id, facility_id: 6001001, ranch }], building_items: [] },
        GetRanchDetail: { ranches: [ranch] },
        GetBag: { physical_items: [{ id: '60001', uid: '9999999999999999', count: '1', locked: true }], virtual_items: [{ id: '1007', count: '123' }] },
        GetBagTab: { tabs: [{ tab_id: '6', tab_name: '牧场幼崽' }] },
        GetOrderPanel: { panel: { slots: [] } },
        HarvestRanch: { op_results: [] }, CleanRanch: { op_results: [] }, TriggerProduce: { op_results: [] }, PlaceAnimal: { op_results: [] }, AddFeed: {}, SubmitOrder: {}, RefreshOrder: {},
    };
    const service = createRanchService({ getKnownFriendGids: () => [], ...options, session, getSettings: () => automation, getUserState: () => ({ gid: '12345' }), rpc: async (method, params) => {
        calls.push({ method, params });
        if (method === 'PlayerSceneLogin') return { global_scene_id: params.global_scene_id, server_time: '1794800000' };
        if (responses[method] instanceof Error) throw responses[method];
        return responses[method];
    } });
    return { service, calls, session, ranch, responses, automation };
}

test('status works immediately without scene login; settings remain strict opt-in', async () => {
    const f = fixture();
    assert.equal((await f.service.getStatus()).sceneReady, true);
    assert.equal(f.calls.some(c => c.method === 'PlayerSceneLogin'), false);
    assert.equal(normalizeSettings({ ranch_auto_collect: 1, ranch_auto_clean: true }).autoClean, true);
    assert.equal(Object.entries(normalizeSettings({ ranch_auto_collect: 1, ranch_auto_clean: true })).filter(([key, value]) => key !== 'autoClean' && value).length, 0);
});

test('legacy connect/disconnect are reads only and preserve int64 identities', async () => {
    const f = fixture();
    const state = await f.service.connect();
    assert.equal(state.sessionState, 'parallel');
    assert.equal(state.ranches[0].name, '窝');
    assert.equal(state.items[0].uid, '9999999999999999');
    await f.service.disconnect();
    assert.equal(f.calls.some(c => c.method === 'PlayerSceneLogin' || c.method === 'GetPlayerSceneInfo'), false);
});

test('ranch requests queue independently and recover after rejection', async () => {
    const f = fixture();
    f.responses.AllCells = new Error('ranch failed');
    assert.match((await f.service.getStatus()).sectionErrors.buildings, /ranch failed/);
    await assert.rejects(f.service.action({ action: 'collect', ranchId: f.ranch.ranch_inst_id }), /ranch failed/);
    f.responses.AllCells = { facilities: [] };
    const states = await Promise.all([f.service.getStatus(), f.service.getStatus()]);
    assert.equal(states.length, 2);
    assert.equal(states.every(s => s.sceneReady), true);
});

test('collect uses SHELVES op only; clean targets own hazards; unknown and paid actions rejected', async () => {
    const f = fixture(); await f.service.connect();
    for (const action of ['feed', 'donate', 'speedup']) await assert.rejects(f.service.action({ action, ranchId: f.ranch.ranch_inst_id }), /不支持/);
    await assert.rejects(f.service.action({ action: 'collect', ranchId: '44' }), /不属于/);
    await f.service.action({ action: 'collect', ranchId: f.ranch.ranch_inst_id });
    const call = f.calls.find(c => c.method === 'HarvestRanch');
    assert.deepEqual(call.params, { ranch_inst_ids: ['9007199254740993'], op: 2, animals: [], shelves: [] });
    await f.service.action({ action: 'clean', ranchId: f.ranch.ranch_inst_id });
    assert.deepEqual(f.calls.find(c => c.method === 'CleanRanch').params, { host_gid: '12345', hazard_ids: ['888'] });
    f.ranch.shelves[0].can_collect = false;
    await assert.rejects(f.service.action({ action: 'collect', ranchId: f.ranch.ranch_inst_id }), /没有可收集/);
});

test('automation cannot enter scenes, honors latest switches and preconditions', async () => {
    const f = fixture(); f.automation.ranch_auto_collect = true;
    await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'HarvestRanch').length, 1);
    f.automation.ranch_auto_collect = false; await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'HarvestRanch').length, 1);
    f.session.reset(); await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'HarvestRanch').length, 1);
});

test('optional order failure is distinct from successful empty orders', async () => {
    const f = fixture(); f.responses.GetOrderPanel = new Error('未解锁订单');
    const state = await f.service.connect();
    assert.equal(state.ordersError, '未解锁订单'); assert.equal(state.orderPanel, null);
});


test('production and animal harvest use distinct targets and current server flags', async () => {
    const f = fixture(); await f.service.connect();
    await f.service.action({ action: 'produce', ranchId: f.ranch.ranch_inst_id, animalInstId: 1 });
    assert.deepEqual(f.calls.find(c => c.method === 'TriggerProduce').params, { host_gid: '12345', targets: [{ ranch_inst_id: f.ranch.ranch_inst_id, animal_inst_id: 1 }] });
    await assert.rejects(f.service.action({ action: 'harvest', ranchId: f.ranch.ranch_inst_id, animalInstId: 1 }), /不可收获/);
    f.ranch.animals[0].can_harvest = true;
    await f.service.action({ action: 'harvest', ranchId: f.ranch.ranch_inst_id, animalInstId: 1 });
    assert.deepEqual(f.calls.find(c => c.method === 'HarvestRanch').params, { ranch_inst_ids: [], op: 4, animals: [{ ranch_inst_id: f.ranch.ranch_inst_id, animal_inst_id: 1 }], shelves: [] });
    f.ranch.animals[0].producing = true;
    await assert.rejects(f.service.action({ action: 'produce', ranchId: f.ranch.ranch_inst_id, animalInstId: 1 }), /不可生产/);
});

test('placing buys normal cubs directly with gold tickets and respects capacity', async () => {
    const f = fixture(); await f.service.connect();
    f.responses.ShopInfo = { goods_list: [{ id: '10002', price: '2', unlocked: true }] };
    f.responses.BuyGoods = {};
    f.responses.GetBag.physical_items[0].locked = false;
    await f.service.action({ action: 'place', ranchId: f.ranch.ranch_inst_id, itemId: 60001 });
    assert.deepEqual(f.calls.find(c => c.method === 'BuyGoods').params, { goods_id: '10002', num: '1', price: '2', auto_add: true });
    f.ranch.animal_count = 3;
    await assert.rejects(f.service.action({ action: 'place', ranchId: f.ranch.ranch_inst_id, itemId: 60001 }), /已满/);
});

test('grass replenishment cannot buy with currency and validates stock, capacity and instance', async () => {
    const f = fixture();
    f.responses.AllCells.facilities.push({ instance_id: '700', facility_id: 7001001, capacity: 10, feed_machine: { feed_count: 8 } });
    f.responses.GetBag.physical_items.push({ id: '7001', count: '3' });
    await f.service.connect();
    for (const count of [0, -1, 1.2, 2147483648]) await assert.rejects(f.service.action({ action: 'addFeed', facilityInstId: '700', count }), /正整数/);
    await assert.rejects(f.service.action({ action: 'addFeed', facilityInstId: '700', count: 3 }), /容量/);
    await assert.rejects(f.service.action({ action: 'addFeed', facilityInstId: '700', count: 4 }), /库存不足/);
    await f.service.action({ action: 'addFeed', facilityInstId: '700', count: 2, useGold: true });
    assert.deepEqual(f.calls.find(c => c.method === 'AddFeed').params, { instance_id: '700', add_count: 2, use_gold: false, host_gid: '0' });
});

test('orders reject stale instance, zero quota, locked and currency requirements', async () => {
    const f = fixture();
    const order = { slot_index: 0, instance_id: 'order-a', submit_state: 1, req_items: [{ id: '1060001', count: '2' }], reward_items: [] };
    f.responses.GetOrderPanel = { panel: { submit_quota: 1, refresh_quota: 1, slots: [order] } };
    f.responses.GetBag.physical_items.push({ id: '1060001', count: '3', locked: false });
    await f.service.connect();
    await assert.rejects(f.service.action({ action: 'submitOrder', slotIndex: 0, instanceId: 'stale' }), /已刷新/);
    await f.service.action({ action: 'submitOrder', slotIndex: 0, instanceId: 'order-a' });
    assert.deepEqual(f.calls.find(c => c.method === 'SubmitOrder').params, { slot_index: 0, instance_id: 'order-a' });
    f.responses.GetOrderPanel.panel.submit_quota = 0;
    await assert.rejects(f.service.action({ action: 'submitOrder', slotIndex: 0, instanceId: 'order-a' }), /次数/);
    f.responses.GetOrderPanel.panel.submit_quota = 1; order.req_items = [{ id: '1007', count: '1' }];
    await assert.rejects(f.service.action({ action: 'submitOrder', slotIndex: 0, instanceId: 'order-a' }), /未确认安全/);
    await f.service.action({ action: 'refreshOrder', slotIndex: 0, instanceId: 'order-a' });
    assert.deepEqual(f.calls.find(c => c.method === 'RefreshOrder').params, { slot_index: 0 });
});

test('bundled ranch runtime config matches pinned output digest and tables remain local', () => {
    const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
    const file = path.join(__dirname, '../src/gameConfig/RanchConfig.json');
    const manifest = require('../src/gameConfig/RanchConfig.sources.json');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), manifest.outputSha256);
    assert.equal(manifest.tables.length, 7);
});

test('HAR-confirmed ranch resources use ranch scene IDs, shops and illustrated type', async () => {
    const f = fixture(); await f.service.connect();
    Object.assign(f.responses, {
        GetAll: { game_friends: [{ gid: '9007199254740993' }] }, GetGameFriends: { friends: [] },
        ShopInfo: { goods_list: [] }, RotationShopInfo: { opened: true, goods: [] },
        GetIllustratedListV2: { list: [], type: 101 }, GetIllustratedLevelListV2: {}, GetRanchWeightScoreV2: {},
    });
    await f.service.getResource('friends');
    assert.deepEqual(f.calls.find(c => c.method === 'GetGameFriends').params, { friend_gids: ['9007199254740993'], global_scene_id: 2 });
    await f.service.getResource('shop');
    assert.deepEqual(f.calls.filter(c => c.method === 'ShopInfo').map(c => c.params.shop_id), [5, 6]);
    assert.equal(f.calls.find(c => c.method === 'RotationShopInfo').params.shop_id, 7);
    await f.service.getResource('illustrated');
    assert.deepEqual(f.calls.find(c => c.method === 'GetIllustratedListV2').params, { rarity: 0, type: 101 });
});

test('configuration analytics works without entering ranch and explicitly states assumptions', async () => {
    const f = fixture();
    const result = await f.service.getResource('analytics');
    assert.ok(result.animals.length > 0);
    assert.ok(result.assumptions.includes('未计'));
    assert.equal(f.calls.length, 0);
    f.responses.ShopInfo = { goods_list: [] }; f.responses.RotationShopInfo = {};
    await f.service.getResource('shop');
    assert.equal(f.calls.some(c => c.method === 'PlayerSceneLogin'), false);
});


test('failed bag/detail queries preserve independent sections and block mutations', async () => {
    const f = fixture();
    f.responses.GetBag = new Error('背包失败');
    let state = await f.service.getStatus();
    assert.equal(state.sectionErrors.warehouse, '背包失败');
    assert.equal(state.ranches.length, 1);
    assert.deepEqual(state.currencies, []);
    await assert.rejects(f.service.action({ action: 'collect', ranchId: f.ranch.ranch_inst_id }), /背包失败/);
    assert.equal(f.calls.some(c => c.method === 'HarvestRanch'), false);
    f.responses.GetBag = { physical_items: [], virtual_items: [] };
    f.responses.GetRanchDetail = new Error('动物失败');
    state = await f.service.getStatus();
    assert.equal(state.sectionErrors.overview, '动物失败');
    assert.equal(state.facilities.length, 1);
    assert.equal(state.sectionErrors.warehouse, undefined);
});

test('ordinary ranch purchase validates current price, limits, currency and keeps auto-add disabled', async () => {
    const f = fixture();
    f.responses.ShopInfo = { goods_list: [{ id: '10002', unlocked: true, price: '2', bought_num: '0', limit_count: '4' }] };
    f.responses.BuyGoods = { get_items: [{ id: '60001', count: '2' }] };
    await f.service.action({ action: 'buy', goodsId: '10002', count: 2, price: '2' });
    assert.deepEqual(f.calls.find(c => c.method === 'BuyGoods').params, { goods_id: '10002', num: '2', price: '2', auto_add: false });
    await assert.rejects(f.service.action({ action: 'buy', goodsId: '10002', count: 0, price: '2' }), /数量/);
    await assert.rejects(f.service.action({ action: 'buy', goodsId: '10002', count: 5, price: '2' }), /限额/);
    await assert.rejects(f.service.action({ action: 'buy', goodsId: '10002', count: 1, price: '1' }), /价格/);
    f.responses.ShopInfo.goods_list[0].unlocked = false;
    await assert.rejects(f.service.action({ action: 'buy', goodsId: '10002', count: 1, price: '2' }), /解锁/);
    assert.equal(f.calls.filter(c => c.method === 'BuyGoods').length, 1);
});

test('ranch purchase refuses locked balances and unrelated farm goods', async () => {
    const f = fixture();
    f.responses.ShopInfo = { goods_list: [{ id: '10002', unlocked: true, price: '2' }] };
    f.responses.GetBag = { virtual_items: [{ id: '1007', count: '99', locked: true }] };
    await assert.rejects(f.service.action({ action: 'buy', goodsId: '10002', count: 1, price: '2' }), /金券不足/);
    await assert.rejects(f.service.action({ action: 'buy', goodsId: '15', count: 1, price: '2' }), /牧场商店/);
    assert.equal(f.calls.some(c => c.method === 'BuyGoods'), false);
});

test('illustrated and weight rewards use independent ranch preconditions and exact scope', async () => {
    const f = fixture();
    f.responses.GetIllustratedListV2 = { has_claimable_reward: true };
    f.responses.ClaimAllRewardsV2 = { claimed_level_ids: [1] };
    f.responses.GetRanchWeightScoreV2 = { levels: [{ id: 1, can_claim: true, claimed: false }] };
    f.responses.ClaimRanchWeightScoreRewardV2 = { claimed_ids: [1] };
    f.responses.GetBag = new Error('unrelated bag failure');
    await f.service.action({ action: 'claimIllustrated' });
    await f.service.action({ action: 'claimWeight', id: 1 });
    assert.deepEqual(f.calls.find(c => c.method === 'ClaimAllRewardsV2').params, { type: 101 });
    assert.deepEqual(f.calls.find(c => c.method === 'ClaimRanchWeightScoreRewardV2').params, { id: 1 });
    f.responses.GetIllustratedListV2.has_claimable_reward = false;
    f.responses.GetRanchWeightScoreV2.levels[0].claimed = true;
    await assert.rejects(f.service.action({ action: 'claimIllustrated' }), /没有可领取/);
    await assert.rejects(f.service.action({ action: 'claimWeight', id: 1 }), /已领取/);
    await assert.rejects(f.service.action({ action: 'claimWeight', id: '1' }), /无效/);
});

test('exchange guards stale round, paid currencies, quota, unknown conditions and balance', async () => {
    const f = fixture();
    const goods = { goods_id: '101', cost_item_id: '7002', cost_count: '3', limit_count: '2', limit_used: '0', buy_conds: [] };
    f.responses.RotationShopInfo = { opened: true, present: true, period_day: '1794758400', round_index: 1, goods: [goods] };
    f.responses.GetBag.physical_items.push({ id: '7002', count: '6' });
    f.responses.RotationBuyGoods = { awards: [] };
    const payload = { action: 'exchange', goodsId: '101', count: 1, periodDay: '1794758400', roundIndex: 1, costCount: '3', costItemId: '7002' };
    await f.service.action(payload);
    assert.deepEqual(f.calls.find(c => c.method === 'RotationBuyGoods').params, { goods_id: '101', count: 1, period_day: '1794758400', round_index: 1 });
    await assert.rejects(f.service.action({ ...payload, roundIndex: 2 }), /轮次/);
    goods.cost_item_id = '1004';
    await assert.rejects(f.service.action(payload), /付费/);
    goods.cost_item_id = '7002'; goods.limit_used = '2';
    await assert.rejects(f.service.action(payload), /限额/);
    goods.limit_used = '0'; goods.buy_conds = [{ type: 'unknown', params: '1' }];
    await assert.rejects(f.service.action(payload), /尚未确认/);
    goods.buy_conds = []; f.responses.GetBag.physical_items.pop();
    await assert.rejects(f.service.action(payload), /余额不足/);
    assert.equal(f.calls.filter(c => c.method === 'RotationBuyGoods').length, 1);
});

test('failed optional illustrated and shop sections preserve independent results', async () => {
    const f = fixture();
    f.responses.GetIllustratedListV2 = { list: [{ fruit_id: 60001 }], current_level: 3 };
    f.responses.GetIllustratedLevelListV2 = new Error('level unavailable');
    f.responses.GetRanchWeightScoreV2 = { total_score: '9007199254740993' };
    const book = await f.service.getResource('illustrated');
    assert.equal(book.currentLevel, 3);
    assert.equal(book.weightScore.totalScore, '9007199254740993');
    assert.equal(book.errors.levels, 'level unavailable');
    f.responses.ShopProfiles = { shop_profiles: [] }; f.responses.ShopInfo = { goods_list: [] }; f.responses.RotationShopInfo = new Error('market unavailable');
    const shop = await f.service.getResource('shop');
    assert.equal(shop.shops.length, 2);
    assert.equal(shop.errors.exchange, 'market unavailable');
});

test('ranch shop configuration pins official source and output hashes', () => {
    const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
    const manifest = require('../src/gameConfig/RanchShopConfig.sources.json');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../src/gameConfig/RanchShopConfig.json'))).digest('hex'), manifest.outputSha256);
    assert.equal(manifest.tables.length, 2);
});

test('ranch automation isolates a failed action and reads current switches per target', async () => {
    const f = fixture();
    f.automation.ranch_auto_collect = true;
    f.automation.ranch_auto_clean = true;
    f.responses.HarvestRanch = new Error('collect failed');
    await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'CleanRanch').length, 1);
});

test('harvesting animals and submitting orders require independent persisted opt-in', async () => {
    const f = fixture();
    f.ranch.animals[0].can_harvest = true;
    f.responses.GetOrderPanel = { panel: { submit_quota: 1, slots: [{ slot_index: 0, instance_id: 'order-a', submit_state: 1, req_items: [{ id: '1060001', count: '2' }] }] } };
    f.responses.GetBag.physical_items.push({ id: '1060001', count: '3' });
    await f.service.runAutomation();
    assert.equal(f.calls.length, 0);
    f.automation.ranch_auto_harvest = true;
    f.automation.ranch_auto_submit_orders = true;
    await f.service.runAutomation();
    assert.equal(f.calls.find(c => c.method === 'HarvestRanch').params.op, 4);
    assert.equal(f.calls.filter(c => c.method === 'SubmitOrder').length, 1);
    assert.equal(f.calls.some(c => c.method === 'BuyGoods' || c.method === 'RotationBuyGoods'), false);
});

test('reward automation calls each distinct reward action only when enabled', async () => {
    const f = fixture();
    f.automation.ranch_auto_claim_illustrated = true;
    f.automation.ranch_auto_claim_weight = true;
    Object.assign(f.responses, {
        GetIllustratedListV2: { has_claimable_reward: true, list: [] }, GetIllustratedLevelListV2: {},
        GetRanchWeightScoreV2: { levels: [{ id: 1, can_claim: true, claimed: false }, { id: 2, can_claim: false }] },
        ClaimAllRewardsV2: {}, ClaimRanchWeightScoreRewardV2: {},
    });
    await f.service.runAutomation();
    assert.equal(f.calls.filter(c => c.method === 'ClaimAllRewardsV2').length, 1);
    assert.equal(f.calls.filter(c => c.method === 'ClaimRanchWeightScoreRewardV2').length, 1);
    assert.equal(f.calls.some(c => c.method === 'HarvestRanch' || c.method === 'TriggerProduce'), false);
});

test('official wire item is_locked and item_detail cannot bypass inventory safeguards', async () => {
    const f = fixture();
    f.responses.GetBag.physical_items = [{ id: '60001', count: '2', is_locked: true }, { id: '1060001', count: '3', item_detail: { ranch_product: { weight_x10: 999 } } }];
    const state = await f.service.getStatus();
    assert.equal(state.items[0].locked, true);
    assert.equal(state.items[1].detail.ranchProduct.weightX10, 999);
    assert.ok(state.ranches[0].availableCubs.length > 0);

    f.responses.ShopInfo = { goods_list: [{ id: '10002', unlocked: true, price: '2' }] };
    f.responses.GetBag.virtual_items = [{ id: '1007', count: '999', is_locked: true }];
    await assert.rejects(f.service.action({ action: 'buy', goodsId: '10002', count: 1, price: '2' }), /金券不足/);
});

test('feed uses only existing container seconds, rejects limited phase and never buys', async () => {
    const f = fixture();
    f.ranch.animals[0].can_feed = true;
    f.responses.GetBag.virtual_items.push({ id: '7003', count: '1000' }, { id: '7004', count: '2000' });
    f.responses.FeedAnimal = { deduct_secs: '100', bucket_remain_secs: '900' };
    await f.service.action({ action: 'feedAnimal', ranchId: f.ranch.ranch_inst_id, animalInstId: 1, bucketType: 2 });
    assert.deepEqual(f.calls.find(c => c.method === 'FeedAnimal').params, { targets: [{ ranch_inst_id: f.ranch.ranch_inst_id, animal_inst_id: 1 }], bucket_type: 2 });
    f.ranch.animals[0].limited_can_used = true;
    await assert.rejects(f.service.action({ action: 'feedAnimal', ranchId: f.ranch.ranch_inst_id, animalInstId: 1, bucketType: 2 }), /受限/);
    f.responses.GetBag.virtual_items.find(i => i.id === '7004').count = '0';
    await assert.rejects(f.service.action({ action: 'feedAnimal', ranchId: f.ranch.ranch_inst_id, animalInstId: 1, bucketType: 1 }), /时长不足/);
    assert.equal(f.calls.some(c => c.method === 'BuyGoods'), false);
});

test('building upgrade revalidates ranch level, quoted costs and paid-resource protection', async () => {
    const calls = [];
    const responses = {
        AllCells: { facilities: [{ instance_id: '9999999999999999', facility_id: 7001001, level: 1, upgrade_state: 0 }] },
        GetBag: { virtual_items: [{ id: '1007', count: '6000' }, { id: '1102', count: '23800' }] }, GetBagTab: {}, GetOrderPanel: {},
        BatchGetBasicInfo: { basic_infos: [{ gid: '42', big_farm_level: '10' }] },
        GetFacilityDetail: { info: { upgrade_cost: [{ id: '1007', count: '6000' }] } }, UpgradeBuilding: {},
    };
    const service = createRanchService({ getUserState: () => ({ gid: '42', openId: 'fixture-openid', level: 100 }), session: createRanchSession(), rpc: async (method, params) => { calls.push({ method, params }); return responses[method]; } });
    const payload = { action: 'upgradeBuilding', facilityInstId: '9999999999999999', costs: [{ id: '1007', count: '6000' }] };
    await service.action(payload);
    assert.deepEqual(calls.find(c => c.method === 'UpgradeBuilding').params, { inst_id: '9999999999999999' });
    responses.GetBag.virtual_items[1].count = '23799';
    await assert.rejects(service.action(payload), /等级/);
    responses.GetBag.virtual_items[1].count = '23800';
    await assert.rejects(service.action({ ...payload, costs: [{ id: '1007', count: '1' }] }), /费用已变动/);
    responses.GetFacilityDetail.info.upgrade_cost = [{ id: '1004', count: '1' }];
    await assert.rejects(service.action({ ...payload, costs: [{ id: '1004', count: '1' }] }), /付费/);
    assert.equal(calls.filter(c => c.method === 'UpgradeBuilding').length, 1);
});


test('overview operation counts reset at Beijing midnight, not process restart', async () => {
    let time = Date.parse('2026-11-16T15:59:59Z');
    const f = fixture({ now: () => time });
    await f.service.action({ action: 'collect', ranchId: f.ranch.ranch_inst_id });
    let state = await f.service.getStatus();
    assert.equal(state.operationsDate, '2026-11-16');
    assert.equal(state.operations.collect, 1);
    time += 1000;
    state = await f.service.getStatus();
    assert.equal(state.operationsDate, '2026-11-17');
    assert.deepEqual(state.operations, {});
    await f.service.action({ action: 'collect', ranchId: f.ranch.ranch_inst_id });
    assert.equal((await f.service.getStatus()).operations.collect, 1);
});

test('ranch profile uses the official BigFarmLevel experience thresholds', async () => {
    const service = createRanchService({
        session: createRanchSession(),
        getUserState: () => ({ gid: '1', name: 'test', avatar: 'fixture-avatar' }),
        rpc: async (method, params) => {
            assert.equal(method, 'GetBag');
            assert.deepEqual(params, { global_scene_id: 2, tab_id: 0 });
            return { virtual_items: [{ id: '1102', count: '450' }] };
        },
    });
    const profile = await service.getResource('profile');
    assert.equal(profile.name, 'test');
    assert.equal(profile.avatar, 'fixture-avatar');
    assert.deepEqual(profile.levelProgress, { current: 150, needed: 400 });
});

test('profile computes screenshot level 13 progress after actual protobuf decoding', async () => {
    const { createRanchProtocol } = require('../src/services/ranch-protocol');
    const protocol = createRanchProtocol();
    const type = protocol.rpc.BatchGetBasicInfo.responseType;
    const bytes = type.encode(type.fromObject({ basic_infos: [{ gid: '1', big_farm_level: 13, big_farm_exp: '78023' }] })).finish();
    const reply = protocol.decode('BatchGetBasicInfo', bytes);
    assert.equal(reply.basic_infos[0].big_farm_level, '13');
    const service = createRanchService({
        session: createRanchSession(),
        getUserState: () => ({ gid: 1, openId: 'test' }),
        rpc: async method => {
            assert.equal(method, 'GetBag');
            return { virtual_items: [{ id: '1102', count: reply.basic_infos[0].big_farm_exp }] };
        },
    });
    const profile = await service.getResource('profile');
    const levels = require('../src/gameConfig/RanchLevel.json');
    assert.equal(profile.level, 13);
    assert.equal(profile.exp, '78023');
    assert.deepEqual(profile.levelProgress, {
        current: 78023 - levels.find(row => row.level === 13).exp,
        needed: levels.find(row => row.level === 14).exp - levels.find(row => row.level === 13).exp,
    });
    assert.ok(profile.levelProgress.needed > 0);
});

test('animal cards expose official inventory icons and configured phase duration', async () => {
    const f = fixture();
    let state = await f.service.getStatus();
    assert.equal(state.ranches[0].animals[0].image, '/game-config/ranch-icons/animals/60001_4.png');
    assert.equal(state.ranches[0].animals[0].phaseDurationMs, 8000);
    f.ranch.animals[0].stage = 1;
    state = await f.service.getStatus();
    assert.equal(state.ranches[0].animals[0].image, '/game-config/ranch-icons/animals/60001_1.png');
    assert.equal(state.ranches[0].animals[0].phaseDurationMs, 4000);
});

 test('ranch friends resolve saved QQ GIDs when GetAll is empty and exclude blocked/self', async () => {
    const f = fixture({ getKnownFriendGids: () => ['9007199254740993', '9007199254740993', '99', '12345'] });
    f.responses.GetAll = { game_friends: [], blocked_players: [{ gid: '99' }] };
    f.responses.GetGameFriends = { friends: [{ gid: '9007199254740993', name: '好友', big_farm_level: '5' }] };
    const result = await f.service.getResource('friends');
    assert.equal(result.friends[0].gid, '9007199254740993');
    assert.equal(result.friends[0].bigFarmLevel, '5');
    assert.deepEqual(f.calls.find(c => c.method === 'GetGameFriends').params, { friend_gids: ['9007199254740993'], global_scene_id: 2 });
});

test('ranch operation logs include target, actual rewards and manual/automatic trigger', async () => {
    const logs = [];
    const f = fixture({ log: (tag, msg, meta) => logs.push({ tag, msg, meta }) });
    f.responses.HarvestRanch = { op_results: [{ rewards: [{ id: '1007', count: '9007199254740993' }], costs: [] }] };
    await f.service.action({ action: 'collect', ranchId: f.ranch.ranch_inst_id });
    assert.match(logs[0].msg, /手动收集产物成功.*窝 #9007199254740993.*9007199254740993/);
    assert.equal(logs[0].meta.rewards[0].count, '9007199254740993');
    assert.equal(logs[0].meta.ranchId, f.ranch.ranch_inst_id);
    f.automation.ranch_auto_collect = true;
    await f.service.action({ action: 'collect', ranchId: f.ranch.ranch_inst_id }, 'autoCollect');
    assert.match(logs[1].msg, /自动收集产物成功/);
    assert.equal(logs[1].meta.trigger, 'automatic');
});

test('ranch rejected operation logs identify action and target without claiming success', async () => {
    const logs = [];
    const f = fixture({ log: (tag, msg, meta) => logs.push({ tag, msg, meta }) });
    await assert.rejects(f.service.action({ action: 'collect', ranchId: '42', token: 'DO_NOT_LOG' }), /不属于/);
    assert.equal(logs.length, 1);
    assert.match(logs[0].msg, /手动收集产物失败.*42.*不属于/);
    assert.equal(logs[0].meta.result, 'error');
    assert.equal(JSON.stringify(logs).includes('DO_NOT_LOG'), false);
});

test('shop exposes five exact resource balances and official item images without live requests', async () => {
    const f = fixture();
    f.responses.ShopInfo = { goods_list: [{ id: '10002', unlocked: true, price: '2' }, { id: '10001', price: '60' }] };
    f.responses.RotationShopInfo = { goods: [{ goods_id: 1, item_id: 60002 }] };
    f.responses.GetBag = { physical_items: [{ id: 7002, count: '3' }, { id: 1008, count: '7' }], virtual_items: [{ id: 1007, count: '9007199254740993' }, { id: 1002, count: '4' }, { id: 1004, count: '5' }] };
    const data = await f.service.getResource('shop');
    assert.deepEqual(data.resources.map(r => [r.id, r.count]), [[1007, '9007199254740993'], [1008, '7'], [1002, '4'], [1004, '5'], [7002, '3']]);
    assert.equal(data.balance, '9007199254740993');
    assert.match(data.shops[0].goodsList[0].image, /60001_1.png$/);
    assert.ok(data.shops[0].goodsList[1].image);
    assert.match(data.exchangeMarket.goods[0].image, /60002_1.png$/);
    for (const item of [...data.resources, ...data.shops[0].goodsList])
        assert.ok(['../../web/public', '../src'].some(root => require('node:fs').existsSync(require('node:path').resolve(__dirname, root, decodeURIComponent(item.image.slice(1)).replace(/^game-config\//, root === '../src' ? 'gameConfig/' : 'game-config/')))), item.image);
    f.responses.GetBag = new Error('bag unavailable');
    const failed = await f.service.getResource('shop');
    assert.ok(failed.resources.every(r => r.count === null));
    assert.equal(failed.balance, null);
});


test('own ranch profile rejects unavailable XP instead of inventing level one', async () => {
    for (const bag of [{}, { virtual_items: [{ id: '1102', count: '-1' }] }, { virtual_items: [{ id: '1102', count: 'bad' }] }]) {
        const service = createRanchService({ session: createRanchSession(), getUserState: () => ({ gid: 1 }), rpc: async method => {
            assert.equal(method, 'GetBag');
            return bag;
        } });
        await assert.rejects(service.getResource('profile'), /有效的牧场经验/);
    }
});

test('own ranch profile preserves zero XP and propagates bag failures', async () => {
    const service = createRanchService({ session: createRanchSession(), getUserState: () => ({ gid: 1 }), rpc: async () => ({ virtual_items: [{ id: '1102', count: '0' }] }) });
    assert.equal((await service.getResource('profile')).level, 1);
    const failed = createRanchService({ session: createRanchSession(), getUserState: () => ({ gid: 1 }), rpc: async () => { throw new Error('fixture bag failure'); } });
    await assert.rejects(failed.getResource('profile'), /fixture bag failure/);
});

test('ranch task query is scene scoped, filters farm tasks, preserves int64 IDs and reports missing replies', async () => {
    const f = fixture();
    const task = { id: '9007199254740999', task_type: 4, is_unlocked: true, progress: '1', total_progress: '3', cond_type: '126', params: ['60001'], rewards: [{ id: '1007', count: '10' }] };
    f.responses.TaskInfo = { task_info: { tasks: [task, { ...task, id: '1', task_type: 1 }] } };
    const state = await f.service.getStatus();
    assert.equal(state.tasks.length, 1);
    assert.equal(state.tasks[0].id, task.id);
    assert.equal(state.tasks[0].totalProgress, '3');
    assert.equal(state.tasks[0].rewards[0].name, '金券');
    assert.deepEqual(f.calls.find(c => c.method === 'TaskInfo').params, { global_scene_id: 2 });
    f.responses.TaskInfo = {};
    assert.match((await f.service.getStatus()).sectionErrors.tasks, /task_info/);
    f.responses.TaskInfo = { task_info: {} };
    assert.deepEqual((await f.service.getStatus()).tasks, []);
});

test('ranch friends use GetAll rather than empty platform SyncAll', async () => {
    const f = fixture();
    f.responses.GetAll = { game_friends: [] };
    await f.service.getResource('friends');
    assert.deepEqual(f.calls.find(c => c.method === 'GetAll').params, { global_scene_id: 2 });
    assert.equal(f.calls.some(c => c.method === 'SyncAll'), false);
});

const claimableRanchTask = (id = '300024', task_type = 4, extra = {}) => ({ id, task_type, is_unlocked: true, progress: '11', total_progress: '11', ...extra });
test('ranch claim validates live scene, daily batch and growth normal rewards', async () => {
    const f = fixture();
    f.responses.TaskInfo = { task_info: { tasks: [claimableRanchTask(), claimableRanchTask('400003', 5)] } };
    f.responses.ClaimTaskReward = { task_info: { tasks: [] }, items: [] };
    f.responses.BatchClaimTaskReward = { task_info: { tasks: [] }, items: [] };
    await f.service.action({ action: 'claimTask', taskId: '300024' });
    await f.service.action({ action: 'claimTask', taskId: '400003' });
    assert.deepEqual(f.calls.find(c => c.method === 'ClaimTaskReward').params, { id: '300024', do_shared: false });
    assert.deepEqual(f.calls.find(c => c.method === 'BatchClaimTaskReward').params, { ids: ['400003'] });
    assert.ok(f.calls.filter(c => c.method === 'TaskInfo').every(c => c.params.global_scene_id === 2));
    for (const task of [claimableRanchTask('300024', 1), claimableRanchTask('300024', 6), claimableRanchTask('300024', 4, { is_claimed: true }), claimableRanchTask('300024', 4, { is_unlocked: false }), claimableRanchTask('300024', 4, { progress: '1' }), claimableRanchTask('300024', 4, { total_progress: '0' })]) {
        f.responses.TaskInfo = { task_info: { tasks: [task] } };
        await assert.rejects(f.service.action({ action: 'claimTask', taskId: '300024' }), /未完成/);
    }
    f.responses.TaskInfo = {};
    await assert.rejects(f.service.action({ action: 'claimTask', taskId: '300024' }), /缺少/);
    await assert.rejects(f.service.action({ action: 'claimTask', taskId: 300024 }), /无效/);
});
test('ranch task auto claims are opt-in and bounded without repeating unchanged IDs', async () => {
    const f = fixture();
    f.responses.TaskInfo = { task_info: { tasks: [claimableRanchTask()] } };
    f.responses.ClaimTaskReward = { task_info: { tasks: [] } };
    await f.service.runAutomation('farm');
    assert.equal(f.calls.some(c => c.method === 'ClaimTaskReward'), false);
    f.automation.ranch_auto_claim_tasks = true;
    await f.service.runAutomation('farm');
    assert.equal(f.calls.filter(c => c.method === 'ClaimTaskReward').length, 1);
    f.automation.ranch_auto_claim_tasks = false;
    await f.service.runAutomation('farm');
    assert.equal(f.calls.filter(c => c.method === 'ClaimTaskReward').length, 1);
});
test('ranch growth claims advance successive stages, but never retry uncertain writes in the pass', async () => {
    const f = fixture();
    f.automation.ranch_auto_claim_tasks = true;
    let stage = 300024;
    Object.defineProperty(f.responses, 'TaskInfo', { get: () => ({ task_info: { tasks: [claimableRanchTask(String(stage), 4, { progress: stage < 300026 ? '11' : '1' })] } }) });
    Object.defineProperty(f.responses, 'ClaimTaskReward', { get: () => { stage = 300024 + f.calls.filter(c => c.method === 'ClaimTaskReward').length; return { task_info: { tasks: [] } }; } });
    await f.service.runAutomation('farm');
    assert.deepEqual(f.calls.filter(c => c.method === 'ClaimTaskReward').map(c => c.params.id), ['300024', '300025']);
    const g = fixture();
    g.automation.ranch_auto_claim_tasks = true;
    g.responses.TaskInfo = { task_info: { tasks: [claimableRanchTask()] } };
    g.responses.ClaimTaskReward = new Error('timeout');
    await g.service.runAutomation('farm');
    assert.equal(g.calls.filter(c => c.method === 'ClaimTaskReward').length, 1);
});
test('ranch task automation rechecks opt-in immediately before write', async () => {
    const f = fixture();
    f.automation.ranch_auto_claim_tasks = true;
    Object.defineProperty(f.responses, 'TaskInfo', { get: () => { f.automation.ranch_auto_claim_tasks = false; return { task_info: { tasks: [claimableRanchTask()] } }; } });
    await f.service.runAutomation('farm');
    assert.equal(f.calls.some(c => c.method === 'ClaimTaskReward'), false);
});

test('ranch growth shared rewards follow the farm shareMultiple rule, ignoring caller flags', async () => {
    for (const multiple of [undefined, '0', '1', '2', '3']) {
        const f = fixture();
        f.responses.TaskInfo = { task_info: { tasks: [claimableRanchTask('300043', 4, { share_multiple: multiple })] } };
        f.responses.ClaimTaskReward = { task_info: {} };
        await f.service.action({ action: 'claimTask', taskId: '300043', doShared: multiple === '1' });
        assert.deepEqual(f.calls.find(c => c.method === 'ClaimTaskReward').params, { id: '300043', do_shared: Number(multiple) > 1 });
        assert.equal(f.calls.some(c => ['ReportShare', 'CheckCanShare', 'ClaimShareReward'].includes(c.method)), false);
    }
});
test('shared growth rewards use the same path for automation and daily tasks keep batch semantics', async () => {
    const f = fixture();
    f.automation.ranch_auto_claim_tasks = true;
    f.responses.TaskInfo = { task_info: { tasks: [claimableRanchTask('300043', 4, { share_multiple: '2' }), claimableRanchTask('400003', 5, { share_multiple: '2' })] } };
    f.responses.ClaimTaskReward = f.responses.BatchClaimTaskReward = { task_info: {} };
    await f.service.runAutomation('farm');
    assert.deepEqual(f.calls.find(c => c.method === 'ClaimTaskReward').params, { id: '300043', do_shared: true });
    assert.deepEqual(f.calls.find(c => c.method === 'BatchClaimTaskReward').params, { ids: ['400003'] });
});
test('sheds only activate in server READY state, with no purchase or paid resource request', async () => {
    for (const state of [0, 1, 2, 3]) {
        const f = fixture();
        f.responses.AllCells.facilities = [{ instance_id: '10003', facility_id: 6002001, state }];
        f.responses.ActivateFacility = { facility: { instance_id: '10003', facility_id: 6002001, state: 1 } };
        const action = () => f.service.action({ action: 'activateFacility', facilityInstId: '10003' });
        if (state === 3) {
            await action();
            assert.deepEqual(f.calls.find(c => c.method === 'ActivateFacility').params, { instance_id: '10003' });
        } else {
            await assert.rejects(action(), /尚未达到/);
            assert.equal(f.calls.some(c => c.method === 'ActivateFacility'), false);
        }
        assert.equal(f.calls.some(c => ['BuyBuilding', 'BuyGoods', 'Purchase'].includes(c.method)), false);
    }
    const f = fixture();
    await assert.rejects(f.service.action({ action: 'activateFacility', facilityInstId: 'not-owned' }), /尚未达到/);
    f.responses.AllCells.facilities = [{ instance_id: '10003', facility_id: 6001001, state: 3 }];
    await assert.rejects(f.service.action({ action: 'activateFacility', facilityInstId: '10003' }), /尚未达到/);
});
test('shed activation is controlled by upgrade facilities, never upgrade ranch', async () => {
    for (const key of [null, 'ranch_auto_upgrade_ranch', 'ranch_auto_upgrade_facilities']) {
        const f = fixture();
        if (key) f.automation[key] = true;
        f.responses.AllCells.facilities = [{ instance_id: '10003', facility_id: 6002001, state: 3 }];
        f.responses.ActivateFacility = { facility: { instance_id: '10003', facility_id: 6002001, state: 1 } };
        await f.service.runAutomation('farm');
        assert.equal(f.calls.some(c => c.method === 'ActivateFacility'), key === 'ranch_auto_upgrade_facilities');
        assert.equal(f.calls.some(c => c.method === 'UpgradeBuilding'), false);
    }
});
test('shed activation validates reply and rechecks opt-in before writing', async () => {
    const f = fixture();
    f.responses.AllCells.facilities = [{ instance_id: '10003', facility_id: 6002001, state: 3 }];
    f.responses.ActivateFacility = {};
    await assert.rejects(f.service.action({ action: 'activateFacility', facilityInstId: '10003' }), /响应缺少/);
    const writes = f.calls.filter(c => c.method === 'ActivateFacility').length;
    await f.service.action({ action: 'activateFacility', facilityInstId: '10003' }, 'autoUpgradeFacilities');
    assert.equal(f.calls.filter(c => c.method === 'ActivateFacility').length, writes);
    f.automation.ranch_auto_upgrade_ranch = true;
    await assert.rejects(f.service.action({ action: 'activateFacility', facilityInstId: '10003' }, 'autoUpgradeRanch'), /开关与建筑/);
});
test('shed lifecycle activates, upgrades from a fresh pass, then completes after its deadline', async () => {
    let time = 2000000000000;
    const f = fixture({ now: () => time });
    f.automation.ranch_auto_upgrade_facilities = true;
    const facility = { instance_id: '10003', facility_id: 6002001, state: 3, upgrade_state: 0, upgrade_end_time: '0' };
    f.responses.AllCells.facilities = [facility];
    f.responses.GetBag = { virtual_items: [{ id: '1007', count: '1000000' }, { id: '1102', count: '100000000' }] };
    f.responses.ActivateFacility = { facility: { ...facility, state: 1 } };
    f.responses.GetFacilityDetail = { info: { upgrade_cost: [{ id: '1007', count: '14000' }] } };
    f.responses.UpgradeBuilding = {};
    f.responses.CompleteBuildingUpgrade = {};
    await f.service.runAutomation('farm');
    assert.equal(f.calls.filter(c => c.method === 'ActivateFacility').length, 1);
    assert.equal(f.calls.some(c => c.method === 'UpgradeBuilding'), false);
    facility.state = 1; time += 10000;
    await f.service.runAutomation('farm');
    assert.equal(f.calls.filter(c => c.method === 'UpgradeBuilding').length, 1);
    facility.upgrade_state = 1;
    facility.upgrade_end_time = String(time / 1000 + 10);
    await f.service.runAutomation('farm');
    assert.equal(f.calls.some(c => c.method === 'CompleteBuildingUpgrade'), false);
    time += 10000;
    await f.service.runAutomation('farm');
    assert.equal(f.calls.filter(c => c.method === 'CompleteBuildingUpgrade').length, 1);
});


test('ranch resolves known GIDs when legacy GetAll rejects parameters', async () => {
    const f = fixture({ getKnownFriendGids: () => ['12345', '0', 'invalid', '9007199254740993', '9007199254740993'] });
    f.responses.GetAll = new Error('gamepb.friendpb.FriendService.GetAll 错误: code=1000020 请求参数错误');
    f.responses.GetGameFriends = { friends: [{ gid: '9007199254740993', name: '好友' }] };
    const result = await f.service.getResource('friends');
    assert.equal(result.friends[0].gid, '9007199254740993');
    assert.deepEqual(f.calls.find(c => c.method === 'GetGameFriends').params,
        { friend_gids: ['9007199254740993'], global_scene_id: 2 });
});

test('ranch legacy fallback does not hide missing GIDs or other RPC failures', async () => {
    for (const [gids, message] of [[[], 'code=1000020'], [['0', '12345'], 'code=1000020'], [['456'], 'code=1000001'], [['456'], 'REQUEST_TIMEOUT']]) {
        const f = fixture({ getKnownFriendGids: () => gids });
        f.responses.GetAll = new Error(message);
        await assert.rejects(f.service.getResource('friends'), { message });
        assert.equal(f.calls.some(c => c.method === 'GetGameFriends'), false);
    }
});

test('ranch account statistics survive restart and day rollover without leaking across accounts', async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranch-stats-'));
    const previousDir = process.env.FARM_DATA_DIR;
    const previousAccount = process.env.FARM_ACCOUNT_ID;
    try {
        process.env.FARM_DATA_DIR = dir;
        process.env.FARM_ACCOUNT_ID = 'ranch-test-1';
        let time = Date.UTC(2026, 10, 18, 3);
        const first = fixture({ now: () => time });
        await first.service.action({ action: 'collect', ranchId: first.ranch.ranch_inst_id });
        let state = await first.service.getStatus();
        assert.equal(state.operations.collect, 1);
        assert.equal(state.operationsTotal.collect, 1);
        first.service.flushTotalOperations();
        const saved = JSON.parse(fs.readFileSync(path.join(dir, 'stats', 'ranch-ranch-test-1.json'), 'utf8'));
        assert.equal(saved.totalOperations.collect, 1);

        time += 86400000;
        const restarted = fixture({ now: () => time });
        state = await restarted.service.getStatus();
        assert.equal(state.operations.collect, undefined);
        assert.equal(state.operationsTotal.collect, 1);
        await restarted.service.action({ action: 'collect', ranchId: restarted.ranch.ranch_inst_id });
        assert.equal((await restarted.service.getStatus()).operationsTotal.collect, 2);
        restarted.service.flushTotalOperations();

        process.env.FARM_ACCOUNT_ID = 'ranch-test-2';
        const other = fixture({ now: () => time });
        assert.equal((await other.service.getStatus()).operationsTotal.collect, undefined);
    } finally {
        if (previousDir === undefined) delete process.env.FARM_DATA_DIR;
        else process.env.FARM_DATA_DIR = previousDir;
        if (previousAccount === undefined) delete process.env.FARM_ACCOUNT_ID;
        else process.env.FARM_ACCOUNT_ID = previousAccount;
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
