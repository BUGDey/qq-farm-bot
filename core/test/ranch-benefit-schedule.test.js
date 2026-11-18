const test = require('node:test');
const assert = require('node:assert/strict');
const schedule = require('../src/services/ranch-benefit-schedule');

// 以 UTC+8 计算分钟数：localParts(now) 相当于 (now + 8h) 的 UTC。
const at = (day, hour, minute) => Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`);

test('关闭时不触发首开，且记录"此前已关闭"', () => {
    const r = schedule.plan({ enabled: false, accountId: 'a', now: at('2026-11-18', 10, 0), all: {} });
    assert.equal(r.shouldClaim, false);
    assert.equal(r.reason, 'disabled');
});

test('首次开启立即触发一次', () => {
    const r = schedule.plan({ enabled: true, accountId: 'a', now: at('2026-11-18', 10, 0), all: {} });
    assert.equal(r.shouldClaim, true);
    assert.equal(r.reason, 'first-enable');
    assert.equal(r.state.enabledBefore, true);
});

test('同日非窗口时段不再触发（防每轮巡查重复打商城）', () => {
    const armed = { enabledBefore: true, midnightDate: '2026-11-18', noonDate: '2026-11-18' };
    const all = { a: armed };
    for (const [h, m] of [[2, 0], [10, 0], [13, 0], [23, 59]]) {
        const r = schedule.plan({ enabled: true, accountId: 'a', now: at('2026-11-18', h, m), all });
        assert.equal(r.shouldClaim, false, `${h}:${m} should idle`);
        assert.equal(r.reason, 'idle');
    }
});

test('每日凌晨窗口每天触发一次，中午窗口每天补领一次', () => {
    let all = { a: { enabledBefore: true } };
    let r = schedule.plan({ enabled: true, accountId: 'a', now: at('2026-11-18', 0, 5), all });
    assert.equal(r.shouldClaim, true);
    assert.equal(r.reason, 'midnight');
    all = { a: r.state };
    // 同一天凌晨不重复
    assert.equal(schedule.plan({ enabled: true, accountId: 'a', now: at('2026-11-18', 0, 40), all }).shouldClaim, false);
    // 中午补领窗口
    r = schedule.plan({ enabled: true, accountId: 'a', now: at('2026-11-18', 12, 0), all });
    assert.equal(r.shouldClaim, true);
    assert.equal(r.reason, 'noon');
    all = { a: r.state };
    assert.equal(schedule.plan({ enabled: true, accountId: 'a', now: at('2026-11-18', 12, 20), all }).shouldClaim, false);
    // 次日凌晨重新触发
    r = schedule.plan({ enabled: true, accountId: 'a', now: at('2026-11-19', 0, 1), all });
    assert.equal(r.shouldClaim, true);
    assert.equal(r.reason, 'midnight');
});

test('账号维度隔离', () => {
    const all = { b: { enabledBefore: true, midnightDate: '2026-11-18' } };
    const r = schedule.plan({ enabled: true, accountId: 'a', now: at('2026-11-18', 10, 0), all });
    // a 无任何状态 → 视为首次开启（不是复用 b 的状态）
    assert.equal(r.reason, 'first-enable');
});
