const test = require('node:test');
const assert = require('node:assert/strict');
const { ranchOperationDetails } = require('../src/services/ranch-operation-log');

test('confirmed reply fields aggregate exact counts; inventory snapshots are not rewards', () => {
    const result = ranchOperationDetails({ action: 'buy', goodsId: '12', count: 2 }, {
        rewards: [{ id: '1', count: '9007199254740993' }],
        op_results: [{ rewards: [{ id: '1', count: '2' }], costs: [{ id: '2', count: '3' }] }],
        items: [{ id: '3', count: '100' }], token: 'secret',
    }, { goodsItem: '4', itemName: id => `名称${id}` });
    assert.match(result.text, /名称4 ×2.*商品 #12.*名称1 ×9007199254740995.*消耗：名称2 ×3/);
    assert.equal(result.meta.rewards.length, 1);
    assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('empty reply does not invent yield; friend/animal/facility/order targets are readable', () => {
    const result = ranchOperationDetails({ action: 'stroke', hostGid: '9007199254740993', ranchId: '8', animalInstId: '9' }, {}, {
        friendName: '好友甲', state: { ranches: [{ ranchInstId: '8', name: '鸡窝', animals: [{ animalInstId: '9', name: '小鸡' }] }] },
    });
    assert.match(result.text, /好友甲.*9007199254740993.*鸡窝 #8.*小鸡 #9/);
    assert.deepEqual(result.meta.rewards, []);
    assert.match(ranchOperationDetails({ action: 'submitOrder', slotIndex: 0 }, {}).text, /订单 1/);
    assert.match(ranchOperationDetails({ action: 'upgradeBuilding', facilityInstId: '7' }, {}, { state: { facilities: [{ instId: '7', name: '牧草机' }] } }).text, /牧草机 #7/);
});
