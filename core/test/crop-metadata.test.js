const assert = require('node:assert/strict');
const test = require('node:test');

const gameConfig = require('../src/config/gameConfig');
const Illustrated = require('../src/gameConfig/Illustrated.json');
const Plant = require('../src/gameConfig/Plant.json');
const phaseManifest = require('../src/gameConfig/plant_images/manifest.json');

const illustratedRows = Array.isArray(Illustrated) ? Illustrated : Object.values(Illustrated);
const plantRows = Array.isArray(Plant) ? Plant : Object.values(Plant);
const manifestKeys = new Set(Object.keys(phaseManifest));

function cropRows(type) {
  return illustratedRows.filter(row => String(row?.illustrated_type || '') === type);
}

function isPlaceholderName(name) {
  return !name || String(name).startsWith('植物');
}

test('every configured crop has a real display name, grow time and seed icon', () => {
  const broken = [];
  for (const plant of plantRows) {
    const id = Number(plant.id) || 0;
    if (isPlaceholderName(gameConfig.getPlantDisplayName(id))) broken.push({ id, field: 'name' });
    const seedId = Number(plant.seed_id) || 0;
    if (seedId > 0 && !gameConfig.getSeedImageBySeedId(seedId)) broken.push({ id, field: 'seedImage' });
    if (seedId > 0 && !(Number(gameConfig.getPlantGrowTime(id)) > 0)) broken.push({ id, field: 'growTime' });
  }
  assert.deepEqual(broken, [], `作物配置仍有缺项: ${JSON.stringify(broken.slice(0, 10))}`);
});

test('illustrated entries resolve names and icons instead of leaking raw ids', () => {
  const broken = [];
  for (const type of ['超变图鉴', '普通图鉴']) {
    for (const row of cropRows(type)) {
      const id = Number(row.param) || 0;
      if (isPlaceholderName(gameConfig.getPlantDisplayName(id))) broken.push({ type, id, field: 'name' });
      if (!gameConfig.getItemImageById(id)) broken.push({ type, id, field: 'icon' });
    }
  }
  assert.deepEqual(broken, [], `图鉴条目仍有占位名或缺失图标: ${JSON.stringify(broken.slice(0, 10))}`);
});

test('mutant fruit ids resolve back to the base crop name and phase art', () => {
  // 1040112 = 黄金·风信子果实；1120112 = 黄金·风信子展示作物；1020112 = 普通风信子。
  assert.equal(gameConfig.getPlantDisplayName(1040112), '黄金·风信子');
  assert.equal(gameConfig.getPlantDisplayName(1120112), '黄金·风信子');
  assert.match(gameConfig.getPlantImageByPhase(1040112, 3), /plant_images\/Crop_112\/3\.png$/);
  assert.match(gameConfig.getPlantImageByPhase(1120112, 4), /plant_images\/Crop_112\/4\.png$/);
  // 普通风信子仍然解析到自己。
  assert.equal(gameConfig.getPlantDisplayName(1020112), '风信子');
});

test('the only missing phase art is limited to crops whose assets were never exported', () => {
  const missing = [];
  for (const type of ['超变图鉴', '普通图鉴']) {
    for (const row of cropRows(type)) {
      const id = Number(row.param) || 0;
      if (gameConfig.getPlantImageByPhase(id, 3)) continue;
      const item = gameConfig.getItemById(id) || {};
      const asset = String(item.asset_name || '').trim();
      const base = asset ? asset.split('/').pop() : '';
      const candidates = [asset, base, `Plant_${id}`, `Crop_${id}`].filter(Boolean);
      missing.push({ id, asset, candidates, knownAsset: candidates.some(name => manifestKeys.has(name)) });
    }
  }
  const fixable = missing.filter(entry => entry.knownAsset);
  assert.deepEqual(fixable, [], `这些作物有可用资源却没解析出来: ${JSON.stringify(fixable.slice(0, 10))}`);
  // 活动作物（如 新春红包、小红花）的资源包本身未导出阶段图，这里只做上限保护，
  // 避免后续新增大量缺失却无人发现。
  assert.ok(missing.length <= 43, `缺失阶段图的作物增加到 ${missing.length} 个，需要补导资源`);
});