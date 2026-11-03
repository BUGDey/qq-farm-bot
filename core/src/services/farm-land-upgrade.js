/**
 * 土地详情/升级条件分析。
 *
 * 数据来源：
 * - 服务端下发的 LandInfo（unlock_condition / upgrade_condition / buff / could_*）
 * - 本地配置 LandLevel.json（各等级加成）、LandLevelNeed.json（升级所需等级与材料，配置兜底）
 *
 * `preceeding_lands_count_need` 是「当前土地等级及以上的地块数量」门槛，
 * 需要结合整张地图才判定得了，所以这里接收 landsMap。
 */

const levels = require('../gameConfig/LandLevel.json');
const upgradeCosts = require('../gameConfig/LandLevelNeed.json');
const { getItemById, getSeedImageBySeedId } = require('../config/gameConfig');

const toNumber = value => Number(value?.toString?.() ?? value) || 0;
const toAmount = value => (/^\d+$/.test(String(value)) ? String(value) : '0');

function levelInfo(level, buff) {
  const config = levels.find(entry => entry.id === level);
  if (!config) return null;
  return {
    level,
    name: config.level_name,
    image: `/land-assets/${level}.png`,
    yieldBonus: toNumber(buff?.plant_yield_bonus ?? config.plant_yield_bonus) / 100,
    growthReduction: toNumber(buff?.planting_time_reduction ?? config.planting_time_reduction) / 100,
    expBonus: toNumber(buff?.plant_exp_bonus ?? config.plant_exp_bonus) / 100,
    mutantMultiplier: toNumber(config.plant_mutant_bonus) / 10000,
    resonanceBonus: toNumber(config.plant_mutant_exp_bonus) / 100,
  };
}

function costs(items) {
  return (items || [])
    .filter(item => toNumber(item.id) > 0 && toNumber(item.count) > 0)
    .map(item => ({
      id: String(item.id),
      count: toAmount(item.count),
      name: getItemById(toNumber(item.id))?.name || `物品 ${item.id}`,
      image: getSeedImageBySeedId(toNumber(item.id)) || '',
    }));
}

function buildLandUpgradeDetail(land, landsMap = new Map()) {
  const id = toNumber(land?.id);
  const level = toNumber(land?.level);
  const maxLevel = toNumber(land?.max_level);
  const current = land?.unlocked ? levelInfo(level, land.buff) : null;

  if (!land?.unlocked) {
    const condition = land?.unlock_condition;
    const precedingId = toNumber(condition?.preceding_land_id);
    return {
      mode: 'unlock',
      current,
      next: levelInfo(1),
      serverAllowed: !!land?.could_unlock,
      needLevel: condition ? toNumber(condition.need_level) : null,
      prerequisite: precedingId
        ? { landId: precedingId, met: !!landsMap.get(precedingId)?.unlocked }
        : null,
      costs: costs([{ id: 1001, count: condition?.need_gold }]),
      unknown: !condition,
    };
  }

  if (maxLevel > 0 && level >= maxLevel) {
    return { mode: 'max', current, next: null, costs: [], unknown: !current };
  }

  const next = levelInfo(level + 1);
  const condition = land?.upgrade_condition;
  const config = upgradeCosts.find(entry => entry.land_id === id && entry.level === level + 1);
  const configItems = String(config?.items_need || '')
    .split(';')
    .filter(Boolean)
    .map((part) => {
      const [itemId, count] = part.split(':');
      return { id: itemId, count };
    });

  const precedingCount = condition ? toNumber(condition.preceeding_lands_count_need) || 1 : 0;
  const precedingOwned = landsMap.size > 0
    ? [...landsMap.values()].filter(entry => entry.unlocked && toNumber(entry.level) >= level).length
    : null;

  return {
    mode: 'upgrade',
    current,
    next,
    serverAllowed: !!land?.could_upgrade,
    needLevel: condition ? toNumber(condition.level_need) : (config?.level_need ?? null),
    prerequisite: null,
    precedingLands: precedingCount > 0
      ? {
          name: current?.name || `等级${level}土地`,
          required: precedingCount,
          owned: precedingOwned,
          met: precedingOwned === null ? null : precedingOwned >= precedingCount,
        }
      : null,
    costs: costs(condition ? (condition.items_need || []) : configItems),
    unknown: !next || (condition ? !toNumber(condition.level_need) || precedingOwned === null : !config),
  };
}

module.exports = { buildLandUpgradeDetail, levelInfo };
