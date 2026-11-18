const test = require('node:test');
const assert = require('node:assert/strict');
const proto = require('../src/utils/proto');
const { describeGoods, createRanchDailyBenefit, GOODS_ID } = require('../src/services/ranch-daily-benefit');

// 真实抓包（2026-11-18 00:38 HAR）里 slot_type=6 的「每日福利」商品字节。
const BENEFIT_GOODS_HEX = '08d10f120ce6af8fe697a5e7a68fe588a9180622060895f10410012a0030013a040801180140016001788092b8c398feffffff0180018092b8c398feffffff01';

async function goodsFromHar() {
    await proto.loadProto();
    return proto.types.RanchMallGoods.decode(Buffer.from(BENEFIT_GOODS_HEX, 'hex'));
}

function listResponse(goodsList) {
    // goods_list 是 repeated bytes（官方私有封装），必须传回原始字节，不能塞 Message 对象。
    const raws = goodsList.map(g => Buffer.isBuffer(g) ? g : proto.types.RanchMallGoods.encode(g).finish());
    return proto.types.GetMallListBySlotTypeResponse.encode(proto.types.GetMallListBySlotTypeResponse.create({ goods_list: raws })).finish();
}

test('official mall goods from the capture decode as a free daily benefit', async () => {
    const goods = await goodsFromHar();
    const state = describeGoods(goods);
    assert.equal(String(goods.goods_id), GOODS_ID);
    assert.equal(goods.name, '每日福利');
    assert.equal(goods.is_free, true);
    assert.equal(state.available, true);
    assert.equal(state.claimed, false);
    assert.equal(state.resetText, '每日重置');
    assert.deepEqual(state.rewards.map(r => [r.id, r.count]), [['80021', '1']]);
    assert.match(state.rewards[0].name, /罐头/);
});

test('claim sends the captured purchase body and confirms with the reply', async () => {
    const goods = await goodsFromHar();
    const sent = [];
    const benefit = createRanchDailyBenefit({ send: async (service, method, body) => {
        sent.push({ service, method, hex: Buffer.from(body).toString('hex') });
        if (method === 'GetMallListBySlotType') return listResponse([goods]);
        return proto.types.RanchMallPurchaseResponse.encode(proto.types.RanchMallPurchaseResponse.create({
            goods_id: GOODS_ID, success: true, reward_items: [{ id: '80021', count: '1' }],
            purchase_limit: { limit_type: 1, bought_count: '1', limit_count: '1' },
        })).finish();
    } });
    const result = await benefit.claim();
    assert.equal(result.claimed, true);
    assert.equal(result.available, false);
    assert.deepEqual(result.rewards.map(r => [r.id, r.count]), [['80021', '1']]);
    assert.equal(sent[0].hex, '080610001802', 'slot_type=6 scene=2 matches the capture');
    assert.equal(sent[1].service, 'gamepb.mallpb.MallService');
    assert.equal(sent[1].method, 'Purchase');
    assert.equal(sent[1].hex, '08d10f1001', 'goods_id=2001 count=1 matches the capture');
});

test('confirmed purchase stays successful when the subsequent status refresh fails', async () => {
    const goods = await goodsFromHar();
    let reads = 0;
    let purchases = 0;
    const benefit = createRanchDailyBenefit({ send: async (service, method) => {
        if (method === 'GetMallListBySlotType') {
            if (++reads > 1) throw new Error('refresh disconnected');
            return listResponse([goods]);
        }
        purchases++;
        return proto.types.RanchMallPurchaseResponse.encode({ goods_id: GOODS_ID, success: true }).finish();
    } });
    const result = await benefit.claim();
    assert.equal(result.claimed, true);
    assert.equal(result.available, false);
    assert.equal(result.refreshError, 'refresh disconnected');
    assert.equal(purchases, 1);
});

test('an unconfirmed purchase reply is reported, never retried as success', async () => {
    const goods = await goodsFromHar();
    const benefit = createRanchDailyBenefit({ send: async (service, method) => {
        if (method === 'GetMallListBySlotType') return listResponse([goods]);
        // 回包 goods_id 对不上：可能已领也可能没领，只能报不确定。
        return proto.types.RanchMallPurchaseResponse.encode(proto.types.RanchMallPurchaseResponse.create({ goods_id: '9999', success: true })).finish();
    } });
    await assert.rejects(() => benefit.claim(), err => {
        assert.equal(err.code, 'RANCH_DAILY_BENEFIT_UNKNOWN');
        assert.match(err.message, /未能确认|勿重复提交/);
        return true;
    });
});

test('already claimed or missing goods stop before any purchase', async () => {
    const goods = await goodsFromHar();
    const claimedGoods = proto.types.RanchMallGoods.decode(Buffer.from(BENEFIT_GOODS_HEX, 'hex'));
    claimedGoods.purchase_limit.bought_count = '1';
    let purchases = 0;
    const claimed = createRanchDailyBenefit({ send: async (service, method) => {
        if (method === 'GetMallListBySlotType') return listResponse([claimedGoods]);
        purchases++;
        return Buffer.alloc(0);
    } });
    await assert.rejects(() => claimed.claim(), /已经领过/);
    assert.equal(purchases, 0);

    const missing = createRanchDailyBenefit({ send: async () => listResponse([]) });
    await assert.rejects(() => missing.claim(), /未下发每日福利商品/);
    assert.equal(purchases, 0);
});
