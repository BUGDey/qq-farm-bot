const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createRequestGate,
  getRequestPriority,
  runWithRequestPriority,
} = require('../src/utils/request-priority');

test('request gate dispatches queued work by priority then FIFO', async () => {
  // 关闭出队节流，专注验证优先级与 FIFO 语义
  const gate = createRequestGate({ maxActive: 1, sendIntervalBaseMs: 0, sendIntervalJitterMs: 0 });
  const firstRelease = await gate.acquire('background');
  const order = [];
  const queued = [
    gate.acquire('friend').then(release => { order.push('friend'); release(); }),
    gate.acquire('critical').then(release => { order.push('critical'); release(); }),
    gate.acquire('farm').then(release => { order.push('farm'); release(); }),
  ];
  firstRelease();
  await Promise.all(queued);
  assert.deepEqual(order, ['critical', 'farm', 'friend']);
});

test('request gate paces dequeued sends with base interval', async () => {
  // 基线 60ms、零抖动：第一次放行应 >= 基线，第二次与第一次间隔 >= 基线
  const gate = createRequestGate({ maxActive: 2, sendIntervalBaseMs: 60, sendIntervalJitterMs: 0 });
  const t0 = Date.now();
  const firstRelease = await gate.acquire('farm');
  const firstAt = Date.now() - t0;
  const secondRelease = await gate.acquire('farm');
  const secondAt = Date.now() - t0;
  assert.ok(firstAt >= 55, `首个请求出队应等待基线间隔，实际 ${firstAt}ms`);
  assert.ok(secondAt - firstAt >= 55, `第二次出队与上次应保持基线间隔，实际间隔 ${secondAt - firstAt}ms`);
  assert.ok(secondAt < firstAt + 1000, `第二次出队不应被过度拖延，实际 ${secondAt}ms`);
  firstRelease();
  secondRelease();
});

test('request gate exposes pacing defaults in snapshot', () => {
  const gate = createRequestGate();
  const snap = gate.snapshot();
  assert.deepEqual(snap.pacing, { baseMs: 250, jitterMs: 150 });
  assert.equal(snap.active, 0);
  assert.equal(snap.queued, 0);
});

test('request priority context is inherited across async work', async () => {
  const observed = await runWithRequestPriority('background', async () => {
    await Promise.resolve();
    return getRequestPriority();
  });
  assert.equal(observed, 'background');
  assert.equal(getRequestPriority(), 'foreground');
});
