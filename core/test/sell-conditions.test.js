const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseActivityEndMs,
  parseSellCondition,
  parseCondSells,
  evaluateSellCondition,
} = require('../src/config/sell-conditions');

// 2026-10-31 12:00 (UTC+8)
const NOW_SEC = Date.UTC(2026, 9, 31, 4, 0, 0) / 1000;

test('parseSellCondition splits kind and value', () => {
  assert.deepEqual(parseSellCondition('活动结束后:2026040201'), { kind: '活动结束后', value: '2026040201' });
  assert.deepEqual(parseSellCondition('道具过期后:expire_time'), { kind: '道具过期后', value: 'expire_time' });
  assert.equal(parseSellCondition(''), null);
});

test('parseActivityEndMs returns end of that day in UTC+8', () => {
  const endMs = parseActivityEndMs('2026110101');
  // 2026-11-01 23:59:59.999 (UTC+8)
  assert.equal(endMs, Date.UTC(2026, 10, 1, 16, 0, 0) - 1);
  assert.equal(parseActivityEndMs('bad'), 0);
});

test('parseCondSells reads currency and price', () => {
  assert.deepEqual(parseCondSells('1001:1000'), { currencyId: 1001, price: 1000 });
  assert.equal(parseCondSells(''), null);
});

test('item without sell_cond is sellable', () => {
  const result = evaluateSellCondition({ id: 1001 }, { nowSec: NOW_SEC });
  assert.equal(result.sellable, true);
  assert.equal(result.blocked, '');
});

test('activity-restricted item stays blocked until activity ends', () => {
  const future = evaluateSellCondition({ sell_cond: '活动结束后:2026110101' }, { nowSec: NOW_SEC });
  assert.equal(future.sellable, false);
  assert.equal(future.blocked, 'activity');
  assert.match(future.reason, /活动结束后/);

  const past = evaluateSellCondition({ sell_cond: '活动结束后:2026040201' }, { nowSec: NOW_SEC });
  assert.equal(past.sellable, true);
});

test('outside-window item is blocked during the activity window', () => {
  const blocked = evaluateSellCondition({ sell_cond: '活动区间外:2026110101' }, { nowSec: NOW_SEC });
  assert.equal(blocked.sellable, false);
  assert.match(blocked.reason, /活动期间不可出售/);

  const allowed = evaluateSellCondition({ sell_cond: '活动区间外:2026090101' }, { nowSec: NOW_SEC });
  assert.equal(allowed.sellable, true);
});

test('expire-based item requires its own expire_time to pass', () => {
  const blocked = evaluateSellCondition(
    { sell_cond: '道具过期后:expire_time' },
    { nowSec: NOW_SEC, expireTime: (NOW_SEC + 3600) * 1000 },
  );
  assert.equal(blocked.sellable, false);
  assert.equal(blocked.blocked, 'expire');

  const allowed = evaluateSellCondition(
    { sell_cond: '道具过期后:expire_time' },
    { nowSec: NOW_SEC, expireTime: (NOW_SEC - 60) * 1000 },
  );
  assert.equal(allowed.sellable, true);

  const unknownExpire = evaluateSellCondition(
    { sell_cond: '道具过期后:expire_time' },
    { nowSec: NOW_SEC },
  );
  assert.equal(unknownExpire.sellable, false);
});

test('unknown condition is treated as not sellable', () => {
  const result = evaluateSellCondition({ sell_cond: '神秘条件:123' }, { nowSec: NOW_SEC });
  assert.equal(result.sellable, false);
  assert.equal(result.blocked, 'unknown');
});

test('cond_sells price is exposed for UI display', () => {
  const result = evaluateSellCondition(
    { sell_cond: '活动结束后:2026040201', cond_sells: '1001:2000' },
    { nowSec: NOW_SEC },
  );
  assert.deepEqual(result.priceInfo, { currencyId: 1001, price: 2000 });
});
