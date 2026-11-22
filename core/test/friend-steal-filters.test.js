const assert = require('node:assert/strict');
const test = require('node:test');

const { analyzeFriendLands } = require('../src/services/friend-land-analyzer');
const { PlantPhase } = require('../src/config/config');

// 风信子：1020112 普通作物，变异 5（黄金）后映射到 1120112 黄金·风信子，
// 其果实 1040112 是超变图鉴条目。1（冰冻）只是普通变异。
const PLAIN_HYACINTH = 1020112;
const GOLDEN_EFFECT = 5;
const FROZEN_EFFECT = 1;

function stealableLand(id, plantId, mutantIds) {
  return {
    id,
    unlocked: true,
    plant: {
      id: plantId,
      mutant_config_ids: mutantIds,
      stealable: true,
      phases: [{ phase: PlantPhase.MATURE, begin_time: 1 }],
    },
  };
}

test('steal filter options are opt-in and default to keeping every stealable crop', () => {
  const lands = [
    stealableLand(3, PLAIN_HYACINTH, []),
    stealableLand(4, PLAIN_HYACINTH, [GOLDEN_EFFECT]),
    stealableLand(5, PLAIN_HYACINTH, [FROZEN_EFFECT]),
  ];

  const all = analyzeFriendLands(lands, 456, '好友', {});
  assert.deepEqual(all.stealable, [3, 4, 5]);

  const explicitOff = analyzeFriendLands(lands, 456, '好友', {
    onlySuperMutant: false,
    onlyMutant: false,
  });
  assert.deepEqual(explicitOff.stealable, [3, 4, 5]);
});

test('onlySuperMutant keeps super-mutant crops and drops plain and ordinary mutants', () => {
  const lands = [
    stealableLand(3, PLAIN_HYACINTH, []),
    stealableLand(4, PLAIN_HYACINTH, [GOLDEN_EFFECT]),
    stealableLand(5, PLAIN_HYACINTH, [FROZEN_EFFECT]),
  ];

  const analysis = analyzeFriendLands(lands, 456, '好友', { onlySuperMutant: true });
  assert.deepEqual(analysis.stealable, [4]);
  assert.deepEqual(analysis.stealableInfo.map(info => info.landId), [4]);
  // 名称必须是真实作物名，不能是「植物1040112」这类占位。
  assert.ok(!String(analysis.stealableInfo[0].name).startsWith('植物'));
});

test('onlyMutant keeps every mutated crop including ordinary and super mutants', () => {
  const lands = [
    stealableLand(3, PLAIN_HYACINTH, []),
    stealableLand(4, PLAIN_HYACINTH, [GOLDEN_EFFECT]),
    stealableLand(5, PLAIN_HYACINTH, [FROZEN_EFFECT]),
  ];

  const analysis = analyzeFriendLands(lands, 456, '好友', { onlyMutant: true });
  assert.deepEqual(analysis.stealable, [4, 5]);
});

test('combining both flags keeps only crops that satisfy both', () => {
  const lands = [
    stealableLand(3, PLAIN_HYACINTH, []),
    stealableLand(4, PLAIN_HYACINTH, [GOLDEN_EFFECT]),
    stealableLand(5, PLAIN_HYACINTH, [FROZEN_EFFECT]),
  ];

  const analysis = analyzeFriendLands(lands, 456, '好友', {
    onlySuperMutant: true,
    onlyMutant: true,
  });
  assert.deepEqual(analysis.stealable, [4]);
});

test('filters ignore self-owned and non-mature lands', () => {
  const lands = [
    stealableLand(6, PLAIN_HYACINTH, [GOLDEN_EFFECT]),
    {
      id: 7,
      unlocked: true,
      plant: {
        id: PLAIN_HYACINTH,
        mutant_config_ids: [GOLDEN_EFFECT],
        stealable: true,
        phases: [{ phase: PlantPhase.BLOOMING, begin_time: 1 }],
      },
    },
  ];

  const analysis = analyzeFriendLands(lands, 456, '好友', { onlySuperMutant: true });
  assert.deepEqual(analysis.stealable, [6], '未成熟的超变作物不能进入候选');
});