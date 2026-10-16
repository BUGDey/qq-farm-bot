const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-farm-sell-excludes-'));
process.env.FARM_DATA_DIR = dataDir;

const store = require('../src/models/store');
const { buildFruitCatalog, extractBagFruits } = require('../src/controllers/admin-bag-routes');

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('sell_fruit_excludes defaults to empty array and survives automation round-trip', () => {
  const automation = store.getAutomation('sell-ex-default');
  assert.deepEqual(automation.sell_fruit_excludes, []);

  store.setAutomation('sell', true, 'sell-ex-default');
  store.setAutomation('sell_fruit_excludes', [41221, '40001', 41221, -5, 0, 'abc'], 'sell-ex-default');
  const after = store.getAutomation('sell-ex-default');
  assert.equal(after.sell, true);
  assert.deepEqual(after.sell_fruit_excludes, [41221, 40001]);
  assert.deepEqual(store.getSellFruitExcludes('sell-ex-default'), [41221, 40001]);
});

test('sell_fruit_excludes normalizes via applyConfigSnapshot and ignores unknown keys', () => {
  store.applyConfigSnapshot({
    automation: {
      sell_fruit_excludes: [49003, 49003, '49004', 'x'],
      sell_fruit_excludes_typo: [1],
    },
  }, { accountId: 'sell-ex-patch' });

  const automation = store.getAutomation('sell-ex-patch');
  assert.deepEqual(automation.sell_fruit_excludes, [49003, 49004]);
  assert.equal(automation.sell_fruit_excludes_typo, undefined);
});

test('fruit catalog is sorted, deduplicated and carries display fields', () => {
  const catalog = buildFruitCatalog();
  assert.ok(catalog.length > 50, '目录应包含大量果实');
  const ids = catalog.map(fruit => fruit.id);
  assert.equal(new Set(ids).size, ids.length, '果实 ID 不应重复');
  assert.ok(ids.every((id, i) => id > 0 && (i === 0 || ids[i - 1] < id)), '应按 ID 升序');
  const sample = catalog.find(fruit => fruit.id === 41221);
  assert.ok(sample, '活动果实（如青梅 41221）也应在目录中');
  assert.ok(sample.name.length > 0);
  assert.equal(sample.inBag, false);
  assert.equal(sample.count, 0);
  assert.ok(catalog.every(fruit => fruit.priceUnit === '金'));
});

test('extractBagFruits keeps only positive-count fruits from bag detail', () => {
  const bag = {
    items: [
      { id: 40001, category: 'fruit', count: 3, name: '草莓果实', image: 'a.png', price: 10, priceUnit: '金' },
      { id: 40002, category: 'fruit', count: 0, name: '白萝卜果实' },
      { id: 20001, category: 'seed', count: 5, name: '草莓种子' },
      { id: 1001, category: 'gold', count: 100, name: '金币' },
    ],
  };
  const fruits = extractBagFruits(bag);
  assert.equal(fruits.length, 1);
  assert.deepEqual(fruits[0], {
    id: 40001, name: '草莓果实', image: 'a.png', price: 10, priceUnit: '金', count: 3, inBag: true,
  });
  assert.deepEqual(extractBagFruits(null), []);
  assert.deepEqual(extractBagFruits({}), []);
});
