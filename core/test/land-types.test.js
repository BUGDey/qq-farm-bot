const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ALL_FERTILIZER_LAND_TYPES,
  FERTILIZER_LAND_TYPE_LABELS,
  getLandTypeByLevel,
} = require('../src/services/farm-fertilizer');
const { getLandTypeNameByLevel } = require('../src/services/farm-land-analyzer');

test('level 6 land maps to blue crystal soil', () => {
  assert.equal(getLandTypeByLevel(6), 'blue');
  assert.equal(getLandTypeByLevel(5), 'purple');
  assert.equal(getLandTypeByLevel(1), 'normal');
  assert.equal(getLandTypeByLevel(0), 'normal');
});

test('blue crystal soil is selectable for fertilizer automation', () => {
  assert.deepEqual(ALL_FERTILIZER_LAND_TYPES, ['blue', 'purple', 'gold', 'black', 'red', 'normal']);
  assert.equal(FERTILIZER_LAND_TYPE_LABELS.blue, '蓝晶土地');
  assert.equal(getLandTypeNameByLevel(6), '蓝晶土地');
  assert.equal(getLandTypeNameByLevel(5), '紫土地');
});
