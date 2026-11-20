const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateGatewayHealth, getOldestPendingAgeMs, nextBusinessBackoffMs, shouldTerminateGateway } = require('../src/utils/gateway-health');

test('watchdog requires pending work and 60 seconds without inbound traffic', () => {
  for (const pendingCount of [0, 1, 8]) {
    for (const inboundAgeMs of [0, 10000, 20000, 59999, 60000, 120000]) {
      assert.equal(shouldTerminateGateway({ pendingCount, inboundAgeMs, oldestPendingAgeMs: 120000 }),
        pendingCount > 0 && inboundAgeMs >= 60000);
    }
  }
});

test('idle heartbeat age does not mark a healthy connection stale', () => {
  assert.deepEqual(evaluateGatewayHealth({ heartbeatAgeMs: 120000, oldestPendingAgeMs: 0 }), { healthy: true, reason: 'ok' });
  assert.deepEqual(evaluateGatewayHealth({ oldestPendingAgeMs: 4999 }), { healthy: true, reason: 'ok' });
  assert.deepEqual(evaluateGatewayHealth({ oldestPendingAgeMs: 20000 }), { healthy: false, reason: 'request_stuck' });
  assert.deepEqual(evaluateGatewayHealth({ connected: false }), { healthy: false, reason: 'disconnected' });
});

test('gateway backoff starts at 30 seconds and caps at 60 seconds', () => {
  assert.equal(nextBusinessBackoffMs(0), 30000);
  assert.equal(nextBusinessBackoffMs(30000), 60000);
  assert.equal(nextBusinessBackoffMs(60000), 60000);
  assert.equal(getOldestPendingAgeMs([9000, 7000], 10000), 3000);
});

test('business health closes at five seconds or a missed heartbeat', () => {
  assert.deepEqual(evaluateGatewayHealth({ oldestPendingAgeMs: 5000 }), { healthy: false, reason: 'request_stuck' });
  assert.deepEqual(evaluateGatewayHealth({ heartbeatMisses: 1 }), { healthy: false, reason: 'heartbeat_missed' });
  assert.equal(evaluateGatewayHealth({ heartbeatMisses: 0, oldestPendingAgeMs: 0 }).healthy, true);
});

test('background yields to active or queued business and scene transactions', () => {
  const { canRunBackground } = require('../src/utils/gateway-health');
  assert.equal(canRunBackground({ healthy: true }), true);
  for (const busy of [{ healthy: false }, { businessActive: 1 }, { businessQueued: 1 }, { sceneActive: true }, { sceneQueued: 1 }]) {
    assert.equal(canRunBackground({ healthy: true, ...busy }), false);
  }
});

test('background idle ignores control-plane traffic and the caller\'s own scene lease', () => {
  const { isIdleForBackground } = require('../src/utils/gateway-health');
  // ACE 上报/心跳走独立闸门，不占 requestGate 水位，后台补数据可以发车。
  assert.equal(isIdleForBackground({ healthy: true, queue: { active: 0, queued: 0 } }), true);
  // 调度器里有在途或排队请求时必须让路。
  assert.equal(isIdleForBackground({ healthy: true, queue: { active: 1, queued: 0 } }), false);
  assert.equal(isIdleForBackground({ healthy: true, queue: { active: 0, queued: 1 } }), false);
  // 场景事务：调用方就在该事务里时不算争用（好友同步整段跑在农场场景内）。
  assert.equal(isIdleForBackground({ healthy: true, sceneActive: true }), false);
  assert.equal(isIdleForBackground({ healthy: true, sceneActive: true, insideScene: true }), true);
  // 有切场在排队时一律让路。
  assert.equal(isIdleForBackground({ healthy: true, sceneQueued: 1, insideScene: true }), false);
  assert.equal(isIdleForBackground({ healthy: false }), false);
});
