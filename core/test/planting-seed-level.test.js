const assert = require('node:assert/strict');
const test = require('node:test');

const { isSeedLockedByLevel } = require('../src/services/planting-service');
const { getAllSeeds, isEventSeedId } = require('../src/config/gameConfig');

// 活动种子（EventPlants 登记）的 >=200 等级是官方占位值，不参与本地种植等级限制。
test('event seeds with level 200 or above bypass the local planting level check', () => {
  const eventHigh = getAllSeeds().filter(seed => isEventSeedId(seed.seedId) && seed.requiredLevel >= 200);
  assert.ok(eventHigh.length > 0, 'there should be event seeds at level 200');
  for (const plantSize of [1, 2]) {
    for (const seed of eventHigh) {
      assert.equal(isSeedLockedByLevel({ ...seed, plantSize }, 1), false, `${seed.name} (${seed.requiredLevel})`);
    }
  }
});

// 官方等级上限已到 200 以上（当前 240），普通种子必须按真实等级判断。
test('normal seeds level 200 or above keep their real unlock boundary', () => {
  const normalHigh = getAllSeeds().filter(seed => !isEventSeedId(seed.seedId) && seed.requiredLevel >= 200);
  assert.ok(normalHigh.length > 0, 'there should be normal seeds above level 200');
  for (const seed of normalHigh) {
    assert.equal(isSeedLockedByLevel(seed, 1), true, `${seed.name} (${seed.requiredLevel}) should lock at level 1`);
    assert.equal(isSeedLockedByLevel(seed, seed.requiredLevel - 1), true, `${seed.name} boundary-1`);
    assert.equal(isSeedLockedByLevel(seed, seed.requiredLevel), false, `${seed.name} boundary`);
  }
});

test('other seed levels retain their exact unlock boundary', () => {
  for (const requiredLevel of [1, 31, 199]) {
    assert.equal(isSeedLockedByLevel({ requiredLevel }, requiredLevel - 1), true);
    assert.equal(isSeedLockedByLevel({ requiredLevel }, requiredLevel), false);
    assert.equal(isSeedLockedByLevel({ requiredLevel }, requiredLevel + 1), false);
  }
});

test('bubble cotton candy stays an event seed while the level 31 pumpkin remains locked', () => {
  const seeds = getAllSeeds();
  const bubble = seeds.find(seed => seed.seedId === 29004);
  assert.equal(bubble.requiredLevel, 200);
  assert.equal(isSeedLockedByLevel(bubble, 1), false);
  const pumpkin = seeds.find(seed => seed.seedId === 29998);
  assert.equal(pumpkin.requiredLevel, 31);
  assert.equal(isSeedLockedByLevel(pumpkin, 30), true);
  assert.equal(isSeedLockedByLevel(pumpkin, 31), false);
});
