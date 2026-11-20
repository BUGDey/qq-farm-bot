const assert = require('node:assert/strict');
const test = require('node:test');

const network = require('../src/utils/network');
network.getGatewayHealth = () => ({ healthy: true, pending: 0, queue: { active: 0, queued: 0, activeByPriority: {}, byPriority: {} } });
network.isGatewayIdleForLowPriority = () => false;
network.waitForGatewayIdle = async () => false;

const friendApi = require('../src/services/friend-api');
const analyzer = require('../src/services/friend-land-analyzer');

const friends = [{ gid: 123, name: '甲' }, { gid: 456, name: '乙' }];

test('busy background lane defers the whole batch without marking friends as dogless', async () => {
  const result = await analyzer.batchGetFriendDogInfo(friends);
  assert.deepEqual(result.deferredGids, [123, 456]);
  assert.equal(result.deferredKind, 'gateway_contention');
  assert.equal(result.map.size, 0, '未请求到的好友不能被写成"无狗"');
  assert.equal(result.failCount, 0);
});

test('a gateway-busy enter defers the rest of the batch instead of erroring per friend', async () => {
  network.isGatewayIdleForLowPriority = () => true;
  network.waitForGatewayIdle = async () => true;
  friendApi.enterFriendFarm = async () => {
    throw Object.assign(new Error('网关繁忙，后台补数据已让路'), { code: 'GATEWAY_BUSY', errorType: 'gateway_busy' });
  };
  const result = await analyzer.batchGetFriendDogInfo(friends);
  assert.deepEqual(result.deferredGids, [123, 456]);
  assert.equal(result.deferredKind, 'gateway_contention');
  assert.equal(result.map.size, 0);
  assert.equal(result.failCount, 0);
});