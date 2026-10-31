const assert = require('node:assert/strict');
const test = require('node:test');

const { createRequestGate, isGatewayBusyError } = require('../src/utils/request-priority');

const noPacing = { sendIntervalBaseMs: 0, sendIntervalJitterMs: 0 };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function trackResolution(promise, label, order) {
  return promise.then(release => {
    order.push(label);
    return release;
  });
}

test('background lane is capped at one in-flight request', async () => {
  const gate = createRequestGate({ maxActive: 2, ...noPacing });
  const first = await gate.acquire('background');
  const order = [];
  const second = trackResolution(gate.acquire('background'), 'second', order);
  await delay(20);
  assert.deepEqual(order, [], '第二个后台请求应排队等待');
  first();
  const release = await second;
  assert.deepEqual(order, ['second']);
  release();
});

test('background only runs when the gateway is idle', async () => {
  const gate = createRequestGate({ maxActive: 2, backgroundIdleOnly: true, ...noPacing });
  const foreground = await gate.acquire('foreground');
  const order = [];
  const background = trackResolution(gate.acquire('background'), 'background', order);
  await delay(20);
  assert.deepEqual(order, [], '前台请求在途时后台不应放行');
  foreground();
  const release = await background;
  assert.deepEqual(order, ['background']);
  release();
});

test('starved lane is promoted ahead of a higher-priority newcomer', async () => {
  const gate = createRequestGate({ maxActive: 1, starvationMs: 30, ...noPacing });
  const holder = await gate.acquire('farm');
  const order = [];
  const friend = trackResolution(gate.acquire('friend'), 'friend', order);
  await delay(60);
  const farm = trackResolution(gate.acquire('farm'), 'farm', order);
  holder();
  const releaseFriend = await friend;
  releaseFriend();
  const releaseFarm = await farm;
  releaseFarm();
  assert.deepEqual(order, ['friend', 'farm'], '排队超时的 friend 应被提升到 farm 之前');
});

test('critical request keeps a reserved slot from low lanes', async () => {
  const gate = createRequestGate({ maxActive: 2, ...noPacing });
  const farmBusy = await gate.acquire('farm');
  const order = [];
  const critical = trackResolution(gate.acquire('critical'), 'critical', order);
  const farmNext = trackResolution(gate.acquire('farm'), 'farm-next', order);
  const releaseCritical = await critical;
  await delay(20);
  assert.deepEqual(order, ['critical'], 'critical 应先于第二个 farm 放行');
  releaseCritical();
  farmBusy();
  const releaseFarmNext = await farmNext;
  releaseFarmNext();
  assert.deepEqual(order, ['critical', 'farm-next']);
});

test('queued request can time out and yield to the next round', async () => {
  const gate = createRequestGate({ maxActive: 1, ...noPacing });
  const holder = await gate.acquire('foreground');
  await assert.rejects(
    gate.acquire('background', { queueTimeoutMs: 20 }),
    err => isGatewayBusyError(err) && err.errorType === 'gateway_busy',
  );
  holder();
});

test('snapshot reports waiting critical and class limits', async () => {
  const gate = createRequestGate({ maxActive: 1, starvationMs: 4000 });
  const snap = gate.snapshot();
  assert.equal(snap.waitingCritical, false);
  assert.ok(snap.limits);
  assert.equal(snap.limits.starvationMs, 4000);
  assert.equal(snap.limits.backgroundIdleOnly, false);
  assert.deepEqual(snap.pacing, { baseMs: 250, jitterMs: 150 });
});
