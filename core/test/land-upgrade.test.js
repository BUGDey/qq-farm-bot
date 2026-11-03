const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLandUpgradeDetail, levelInfo } = require('../src/services/farm-land-upgrade');

const landsMap = (levels) => new Map(levels.map((level, index) => [index + 1, { unlocked: true, level }]));

test('升级详情使用服务端下发的等级与材料字段', () => {
  const info = buildLandUpgradeDetail({
    id: 21,
    unlocked: true,
    level: 4,
    max_level: 5,
    buff: { plant_yield_bonus: 30000, planting_time_reduction: 2000, plant_exp_bonus: 2000 },
    upgrade_condition: {
      preceeding_lands_count_need: 3,
      level_need: 150,
      items_need: [{ id: 1001, count: '450000000' }, { id: 1005, count: '18670' }],
    },
  }, landsMap([4, 4, 4, 3]));

  assert.equal(info.mode, 'upgrade');
  assert.equal(info.needLevel, 150);
  assert.deepEqual(info.costs.map(cost => [cost.id, cost.count]), [['1001', '450000000'], ['1005', '18670']]);
  // 服务端 buff 覆盖静态配置：金土地经验 20%，升级后紫晶 25%
  assert.equal(info.current.expBonus, 20);
  assert.equal(info.next.expBonus, 25);
  assert.equal(info.next.mutantMultiplier, 1.2);
  assert.equal(info.precedingLands.required, 3);
  assert.equal(info.precedingLands.owned, 3);
  assert.equal(info.precedingLands.met, true);
  assert.equal(info.unknown, false);
});

test('前置地块数量不足时判定为未满足', () => {
  const info = buildLandUpgradeDetail({
    id: 21,
    unlocked: true,
    level: 4,
    max_level: 6,
    upgrade_condition: { preceeding_lands_count_need: 5, level_need: 150, items_need: [] },
  }, landsMap([4, 3, 2, 1]));

  assert.equal(info.precedingLands.owned, 1);
  assert.equal(info.precedingLands.met, false);
});

test('满级土地不展示升级消耗', () => {
  const info = buildLandUpgradeDetail({
    unlocked: true,
    level: 5,
    max_level: 5,
    buff: { plant_exp_bonus: 5000 },
  });

  assert.equal(info.mode, 'max');
  assert.equal(info.current.expBonus, 50);
  assert.equal(info.next, null);
  assert.deepEqual(info.costs, []);
});

test('未解锁土地展示前置土地与解锁价格', () => {
  const raw = {
    id: 8,
    unlocked: false,
    unlock_condition: { preceding_land_id: 7, need_level: 10, need_gold: 100000 },
  };

  const info = buildLandUpgradeDetail(raw, new Map([[7, { unlocked: true }]]));
  assert.equal(info.mode, 'unlock');
  assert.equal(info.needLevel, 10);
  assert.equal(info.prerequisite.met, true);
  assert.equal(info.costs[0].count, '100000');

  assert.equal(buildLandUpgradeDetail(raw).prerequisite.met, false);
});

test('缺少服务端条件时回退本地配置，且不推断可升级', () => {
  const info = buildLandUpgradeDetail({ id: 21, unlocked: true, level: 4, max_level: 5 });

  assert.equal(info.needLevel, 150);
  assert.equal(info.serverAllowed, false);
  assert.equal(info.costs[1].count, '18670');
  // 没有服务端条件时只信本地配置：等级与材料够用即不算未知，但没有地图就不猜前置地块
  assert.equal(info.precedingLands, null);
  assert.equal(info.unknown, false);
});

test('levelInfo 覆盖蓝晶土地（新增第 6 级）', () => {
  const blue = levelInfo(6);
  assert.equal(blue.name, '蓝晶土地');
  assert.equal(blue.yieldBonus, 400);
  assert.equal(blue.image, '/land-assets/6.png');
  assert.equal(levelInfo(7), null);
});
