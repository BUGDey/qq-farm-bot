const test = require('node:test');
const assert = require('node:assert');

const { createStallMonitor, isCritical } = require('../src/runtime/gateway-stall');

test('心跳与登录请求不计入假死计数', () => {
    const monitor = createStallMonitor();
    assert.equal(isCritical('gamepb.userpb.UserService', 'Heartbeat'), true);
    const verdict = monitor.onTimeout('gamepb.userpb.UserService', 'Heartbeat');
    assert.equal(verdict.counted, false);
    assert.equal(monitor.snapshot().streak, 0);
});

test('连续 2 次业务超时进入让路（degraded）', () => {
    const monitor = createStallMonitor({ degradedAfter: 2, deadAfter: 7, baseMs: 30000, maxMs: 180000 });
    assert.equal(monitor.onTimeout('gamepb.plantpb.PlantService', 'Plant').degraded, false);
    const second = monitor.onTimeout('gamepb.plantpb.PlantService', 'Plant');
    assert.equal(second.degraded, true);
    assert.equal(second.dead, false, '让路不等于判死');
    const snapshot = monitor.snapshot();
    assert.equal(snapshot.degraded, true);
    assert.ok(snapshot.degradedRemainingMs > 0);
});

test('让路期间退避时长指数增长并封顶', () => {
    const monitor = createStallMonitor({ degradedAfter: 2, deadAfter: 99, baseMs: 30000, maxMs: 180000 });
    monitor.onTimeout('s', 'A');
    const a = monitor.onTimeout('s', 'A').backoffMs;
    const b = monitor.onTimeout('s', 'A').backoffMs;
    const c = monitor.onTimeout('s', 'A').backoffMs;
    const d = monitor.onTimeout('s', 'A').backoffMs;
    assert.equal(a, 30000);
    assert.equal(b, 60000);
    assert.equal(c, 120000);
    assert.equal(d, 180000, '封顶 3 分钟');
});

test('任意一次正常回包即解除让路', () => {
    const monitor = createStallMonitor({ degradedAfter: 2, deadAfter: 7 });
    monitor.onTimeout('s', 'A');
    monitor.onTimeout('s', 'A');
    assert.equal(monitor.snapshot().degraded, true);
    const verdict = monitor.onSuccess('s', 'A');
    assert.equal(verdict.recovered, true);
    const snapshot = monitor.snapshot();
    assert.equal(snapshot.degraded, false);
    assert.equal(snapshot.streak, 0);
});

test('连续 7 次才判死，判死前必须先让路', () => {
    const monitor = createStallMonitor({ degradedAfter: 2, deadAfter: 7 });
    const verdicts = [];
    for (let i = 0; i < 7; i += 1) verdicts.push(monitor.onTimeout('s', 'A'));
    assert.equal(verdicts[1].degraded, true, '第 2 次就该让路');
    assert.equal(verdicts[5].dead, false, '第 6 次还不判死');
    assert.equal(verdicts[6].dead, true, '第 7 次判死');
});