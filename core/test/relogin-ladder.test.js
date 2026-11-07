// 断线重登的节奏：先快后慢，别一掉线就等一小时。
const test = require('node:test');
const assert = require('node:assert/strict');
const { reloginDelayMs } = require('../src/runtime/auto-code-refresh');

test('掉线重登前四次是秒级阶梯', () => {
    assert.equal(reloginDelayMs(1), 10 * 1000);
    assert.equal(reloginDelayMs(2), 30 * 1000);
    assert.equal(reloginDelayMs(3), 90 * 1000);
    assert.equal(reloginDelayMs(4), 300 * 1000);
});

test('超出阶梯后回落到用户配置的分钟间隔', () => {
    assert.equal(reloginDelayMs(5, 60), 60 * 60000);
    assert.equal(reloginDelayMs(9, 15), 15 * 60000);
});

test('异常入参不会产生 0 或负延迟', () => {
    assert.equal(reloginDelayMs(0), 10 * 1000);
    assert.equal(reloginDelayMs(-3), 10 * 1000);
    assert.equal(reloginDelayMs(undefined), 10 * 1000);
    assert.equal(reloginDelayMs(5, 0), 60 * 60000);
});