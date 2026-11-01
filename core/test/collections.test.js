const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCollections,
  getMutationCatalog,
  CATEGORY,
} = require('../src/services/collections');

function buildReply() {
  return {
    details: [
      {
        category: CATEGORY,
        current_score: 120,
        claimed_reward_score: 50,
        collections: [
          { collection_id: '700001', star_level: 2, own_count: '3', is_new: true },
          { collection_id: '710001', star_level: 1, own_count: '1' },
        ],
        wished: [{ collection_id: '700002' }],
        pedestals: [{ pedestal_id: '610201' }],
        buffs: [],
      },
    ],
    display_slots: [
      { display: { category: CATEGORY, item_id: '700001', pedestal_id: '610100' } },
    ],
  };
}

test('normalizeCollections 汇总系列进度、星级与陈列信息', () => {
  const snapshot = normalizeCollections(buildReply());

  assert.equal(snapshot.category, CATEGORY);
  assert.equal(snapshot.score, 120);
  assert.equal(snapshot.claimedScore, 50);
  assert.ok(snapshot.series.length >= 4, '应至少返回四个藏品系列');
  assert.ok(snapshot.totalCount >= snapshot.activatedCount);

  const owned = snapshot.series
    .flatMap((series) => series.items)
    .find((item) => item.id === 700001);
  assert.ok(owned, '700001 应出现在系列里');
  assert.equal(owned.activated, true);
  assert.equal(owned.starLevel, 2);
  assert.equal(owned.ownCount, '3');
  assert.equal(owned.isNew, true);
  assert.equal(owned.displayed, true);

  const wished = snapshot.series
    .flatMap((series) => series.items)
    .find((item) => item.id === 700002);
  assert.ok(wished, '700002 应出现在系列里');
  assert.equal(wished.wished, true);
  assert.equal(wished.activated, false);

  assert.deepEqual(snapshot.display, { itemId: '700001', pedestalId: '610100' });
  assert.ok(snapshot.pedestals.some((row) => row.id === 610100 && row.owned));
  assert.ok(snapshot.pedestals.some((row) => row.id === 610201 && row.owned));
  assert.ok(Array.isArray(snapshot.milestones));
  assert.equal(typeof snapshot.nextRewardScore, 'number');
});

test('normalizeCollections 缺少蓝晶分类时抛出可读错误', () => {
  assert.throws(
    () => normalizeCollections({ details: [{ category: 99 }], display_slots: [] }),
    /未返回蓝晶藏品信息/,
  );
});

test('getMutationCatalog 返回常规、装扮与藏品三组数据', () => {
  const catalog = getMutationCatalog();

  assert.ok(catalog.normal.length > 0, '常规变异不应为空');
  assert.ok(catalog.decoration.length > 0, '装扮变异不应为空');
  assert.ok(catalog.collections.length > 0, '藏品变异不应为空');

  const first = catalog.normal[0];
  assert.equal(typeof first.name, 'string');
  assert.ok(Array.isArray(first.probabilities));
  assert.ok(first.probabilities.every((row) => typeof row.percent === 'number'));

  const series = catalog.collections[0];
  assert.equal(typeof series.name, 'string');
  assert.ok(series.items.length > 0);
  assert.ok(series.mutationRules.every((rule) => typeof rule.probability === 'number'));
});
