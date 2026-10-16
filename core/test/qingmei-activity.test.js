const test = require('node:test');
const assert = require('node:assert/strict');

const {
  selectQingmeiWineMaterialStacks,
  reserveQingmeiFruit,
  createQingmeiWineActiveProbe,
  QINGMEI_FRUIT_ITEM_ID,
} = require('../src/services/activity');

const fruit = (uid, count, mutantTypes) => ({ id: QINGMEI_FRUIT_ITEM_ID, uid, count, ...(mutantTypes ? { mutant_types: mutantTypes } : {}) });

test('酿造选料只取背包里的普通青梅堆叠，按变异等级与 uid 排序', () => {
  const selected = selectQingmeiWineMaterialStacks([
    { id: 1001, uid: 1, count: 99 },
    fruit(11, 323),
    fruit(12, 8),
    { id: QINGMEI_FRUIT_ITEM_ID, uid: 0, count: 5 },
    { id: QINGMEI_FRUIT_ITEM_ID, uid: 13, count: 0 },
    fruit(14, 6, [2]),
    fruit(15, 4, [1]),
  ]);
  // 变异等级小者优先（先消耗变异度低的），其余按 uid 升序；id 回填为堆叠 uid
  assert.deepEqual(selected, [
    { id: 15, count: 4 },
    { id: 14, count: 6 },
    { id: 11, count: 323 },
    { id: 12, count: 8 },
  ]);
});

test('酿造选料单次最多提交 30 堆，多余堆叠留到下一次', () => {
  const items = Array.from({ length: 45 }, (_, index) => fruit(index + 1, 10));
  const selected = selectQingmeiWineMaterialStacks(items);
  assert.equal(selected.length, 30);
  assert.equal(selected[0].id, 1);
  assert.equal(selected[29].id, 30);
  // 显式上限与非法上限
  assert.equal(selectQingmeiWineMaterialStacks(items, 5).length, 5);
  assert.equal(selectQingmeiWineMaterialStacks(items, 0).length, 30);
});

test('青梅在酿造活动进行中保留，活动结束后恢复普通出售', () => {
  assert.equal(reserveQingmeiFruit(QINGMEI_FRUIT_ITEM_ID, true), true);
  assert.equal(reserveQingmeiFruit(QINGMEI_FRUIT_ITEM_ID, false), false);
  assert.equal(reserveQingmeiFruit(1001, true), false);
  assert.equal(reserveQingmeiFruit('41221', true), true);
});

test('活动活性探测带缓存：TTL 内不重复查询，失败沿用上次结果', async () => {
  let calls = 0;
  let active = true;
  const probe = createQingmeiWineActiveProbe(async () => {
    calls += 1;
    if (active === null) throw new Error('network down');
    return { wineActive: active };
  }, 600);
  assert.equal(await probe(1000), true);
  assert.equal(await probe(1200), true);
  assert.equal(calls, 1);
  // TTL 过期重新查询
  active = false;
  assert.equal(await probe(1601), false);
  assert.equal(calls, 2);
  // 查询失败沿用上次结果而不是误判为进行中
  active = null;
  assert.equal(await probe(2300), false);
  assert.equal(calls, 3);
});
