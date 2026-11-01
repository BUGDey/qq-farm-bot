/**
 * 藏品（蓝晶）与变异宝典
 *
 * 藏品数据来自官方 GetCollections 接口，配置来自 gameConfig/collections/*.json；
 * 变异宝典是纯本地数据，不需要运行账号。
 */

const fs = require('node:fs');
const path = require('node:path');
const { getItemById, getItemImageById } = require('../config/gameConfig');
const { getResourcePath } = require('../config/runtime-paths');

const CATEGORY = 1;
const rarityNames = ['', '普通', '稀有', '珍品', '天工'];

function readJson(...segments) {
  return JSON.parse(fs.readFileSync(getResourcePath(...segments), 'utf8'));
}

function readConfig(name) {
  return readJson('gameConfig', 'collections', `${name}.json`);
}

let cache = null;
function configs() {
  if (cache) return cache;
  cache = {
    series: readConfig('CollectionSeries'),
    items: readConfig('CollectionItem'),
    stars: readConfig('CollectionStarLevelNeed'),
    scores: readConfig('CollectionScore'),
    rewards: readConfig('CollectionScoreReward'),
    conditions: readConfig('CollectionCondition'),
    pedestals: readConfig('CollectionPedestal'),
    groups: readConfig('CollectionGroup'),
    probabilities: readConfig('MutantPublicity'),
    buffs: readOptional('BuffCfg.json'),
    mutants: readOptional('MutantEffect.json'),
  };
  return cache;
}

/** 读取可选配置，文件缺失时返回空数组，避免整个页面不可用 */
function readOptional(name) {
  try {
    return readJson('gameConfig', name);
  } catch {
    return [];
  }
}

function quantity(value) {
  return value == null ? '0' : String(value);
}

function rewards(value, collectionId) {
  if (!value) return [];
  return String(value)
    .split(';')
    .filter(Boolean)
    .map((part) => {
      const [id, count] = String(part).split(':');
      const itemId = id === '0' ? collectionId : Number(id);
      return {
        itemId,
        count,
        name: getItemById(itemId)?.name || `物品${itemId}`,
        image: getItemImageById(itemId),
      };
    });
}

function conditionText(value) {
  if (!value) return [];
  const { conditions, series } = configs();
  return String(value)
    .split(';')
    .filter(Boolean)
    .map((id) => {
      const condition = conditions.find((row) => row.condition_id === Number(id));
      if (!condition) return '解锁条件待确认';
      const target = series.find((row) => row.series_id === condition.target_series_id);
      if (condition.condition_type === 3) {
        return `${target?.series_name || '指定系列'}中${condition.required_count}款藏品达到${condition.required_star_level}星`;
      }
      return '解锁条件待确认';
    });
}

function buffDto(row) {
  const value = Number(row.attr_value) / 100;
  return {
    id: row.id,
    name: row.attr_id,
    value,
    description: row.attr_id === '节省10%肥料' ? `${value}%概率节省10%肥料` : `${row.attr_id} +${value}%`,
  };
}

function mutationRules(seriesId) {
  const { groups } = configs();
  return groups
    .filter((row) => row.series_id === seriesId)
    .sort((a, b) => a.display_order - b.display_order)
    .map((row) => ({
      name: row.group_name,
      probability: Number((row.public_probability / 100).toFixed(1)),
      guarantee: row.display_guarantee,
    }));
}

/** 把服务端 GetCollectionsReply 归一成前端使用的结构 */
function normalizeCollections(reply) {
  const { series: seriesConfig, items: itemConfig, stars: starConfig, scores: scoreConfig, rewards: rewardConfig, pedestals: pedestalConfig, buffs } = configs();

  const detail = (reply.details || []).find((row) => Number(row.category) === CATEGORY);
  if (!detail) throw new Error('当前账号未返回蓝晶藏品信息');

  const owned = new Map((detail.collections || []).map((row) => [quantity(row.collection_id), row]));
  const display = (reply.display_slots || []).find((row) => Number(row.display?.category) === CATEGORY)?.display;
  const score = Number(detail.current_score) || 0;
  const claimedScore = Number(detail.claimed_reward_score) || 0;

  const series = seriesConfig
    .filter((row) => Number(row.category) === CATEGORY)
    .sort((a, b) => a.display_order - b.display_order)
    .map((row) => {
      const items = itemConfig
        .filter((item) => item.series_id === row.series_id)
        .sort((a, b) => a.display_order - b.display_order)
        .map((item) => {
          const state = owned.get(String(item.item_id));
          const starLevel = Number(state?.star_level) || 0;
          const definition = getItemById(item.item_id);
          const nextStar = starConfig.find((entry) => entry.series_id === row.series_id && entry.star_level === starLevel + 1);
          const scoreRow = scoreConfig.find((entry) => Number(entry.category) === CATEGORY && entry.star_level === starLevel);
          const scoreValues = scoreRow ? String(scoreRow.score).split(';') : [];
          return {
            id: item.item_id,
            name: definition?.name || `藏品${item.item_id}`,
            description: definition?.desc || '',
            image: getItemImageById(item.item_id),
            starLevel,
            maxStarLevel: 5,
            ownCount: quantity(state?.own_count),
            activated: starLevel > 0,
            isNew: state?.is_new === true,
            score: Number(scoreValues[Number(row.series_rarity) - 1]) || 0,
            displayed: quantity(display?.item_id) === String(item.item_id),
            wished: (detail.wished || []).some((wish) => quantity(wish.collection_id) === String(item.item_id)),
            requirements: conditionText(item.unlock_condition_ids),
            nextStarCosts: rewards(nextStar?.items_need || null, item.item_id),
          };
        });
      return {
        id: row.series_id,
        name: row.series_name,
        rarity: row.series_rarity,
        rarityName: rarityNames[row.series_rarity] || '',
        description: row.desc || '',
        requirements: conditionText(row.unlock_condition_ids),
        mutationRules: mutationRules(row.series_id),
        items,
        activatedCount: items.filter((item) => item.activated).length,
        totalCount: items.length,
      };
    });

  const milestones = rewardConfig
    .filter((row) => Number(row.category) === CATEGORY)
    .sort((a, b) => a.score - b.score)
    .map((row) => ({
      level: row.level,
      score: row.score,
      claimed: row.score <= claimedScore,
      reached: row.score <= score,
      rewards: rewards(row.rewards),
      buffs: buffs
        .filter((buff) => buff.source_type === '藏品属性' && Number(buff.source_param) === row.level)
        .map(buffDto),
    }));

  const currentBuffs = new Map();
  for (const milestone of milestones.filter((row) => row.claimed)) {
    for (const buff of milestone.buffs) currentBuffs.set(buff.name, buff);
  }

  return {
    category: CATEGORY,
    score,
    claimedScore,
    activatedCount: series.reduce((sum, row) => sum + row.activatedCount, 0),
    totalCount: series.reduce((sum, row) => sum + row.totalCount, 0),
    nextRewardScore: milestones.find((row) => !row.claimed)?.score ?? null,
    currentBuffs: [...currentBuffs.values()],
    milestones,
    series,
    display: display && Number(display.item_id) > 0
      ? { itemId: quantity(display.item_id), pedestalId: quantity(display.pedestal_id) }
      : null,
    pedestals: pedestalConfig
      .filter((row) => Number(row.category) === CATEGORY)
      .map((row) => ({
        id: row.pedestal_id,
        name: getItemById(row.pedestal_id)?.name || '展台',
        image: getItemImageById(row.pedestal_id),
        owned: row.is_default === 1 || (detail.pedestals || []).some((item) => quantity(item.pedestal_id) === String(row.pedestal_id)),
      })),
    updatedAt: Date.now(),
  };
}

let pendingSnapshot = null;

/** 读取藏品快照，并发调用合并成一次请求 */
function getCollectionsSnapshot() {
  if (pendingSnapshot) return pendingSnapshot;
  const request = (async () => {
    const { sendMsgAsync } = require('../utils/network');
    const { types } = require('../utils/proto');
    const body = types.GetCollectionsRequest.encode({ categories: [CATEGORY] }).finish();
    const reply = await sendMsgAsync('gamepb.collectionpb.CollectionService', 'GetCollections', body);
    return normalizeCollections(types.GetCollectionsReply.decode(reply.body));
  })();
  pendingSnapshot = request;
  request
    .finally(() => {
      if (pendingSnapshot === request) pendingSnapshot = null;
    })
    .catch(() => {});
  return request;
}

/** 变异效果的文字说明，兼容新旧两版 MutantEffect 配置 */
function mutationEffectText(row) {
  if (row.actions) {
    const [action, value] = String(row.actions).split(':').map(Number);
    if (action === 2) return `数量 ×${value}`;
    if (action === 3) return `售价 ×${value}`;
    if (action === 4) return `产出 ${row.fruit_name || ''}`.trim();
    return '';
  }
  const value = Number(row.param) || 1;
  if (Number(row.effect_type) === 2) return `数量 ×${value}`;
  if (Number(row.effect_type) === 3) return `售价 ×${value}`;
  if (Number(row.effect_type) === 4) return `产出 ${row.fruit_name || ''}`.trim();
  return '';
}

/** 变异图标目录：宿主配置优先，其次各活动插件里的素材 */
const MUTANT_IMAGE_DIRS = (() => {
  const dirs = [path.join(getResourcePath('gameConfig'), 'seed_images_named', 'mutant')];
  const pluginRoot = path.resolve(__dirname, '..', '..', 'plugins');
  try {
    for (const entry of fs.readdirSync(pluginRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        dirs.push(path.join(pluginRoot, entry.name, 'assets', 'seed_images_named', 'mutant'));
      }
    }
  } catch {
    /* 没有插件目录时忽略 */
  }
  return dirs;
})();

/**
 * 变异图标地址。
 * 官方配置里 `icon` 有时是文件名（frozen），有时是整条 sprite 路径
 * （gui/texture/mutant/icon/naicha/spriteFrame.png），统一取出目录名再找文件。
 */
function mutantImage(row) {
  const raw = String(row.icon || '');
  const parts = raw.split('/').filter(Boolean);
  const slug = parts.length > 1 ? parts[parts.length - 2] : raw;
  const candidates = [slug && `${slug}.png`, `${row.id}.png`].filter(Boolean);
  for (const name of candidates) {
    for (const dir of MUTANT_IMAGE_DIRS) {
      if (fs.existsSync(path.join(dir, name))) {
        return `/game-config/seed_images_named/mutant/${name}`;
      }
    }
  }
  return '';
}

/** 变异宝典（常规 / 装扮 / 藏品系列），纯本地数据 */
function getMutationCatalog() {
  const { series: seriesConfig, items: itemConfig, mutants, probabilities } = configs();

  const effects = mutants
    .filter((row) => !row.hide_ui)
    .sort((a, b) => Number(a.sort) - Number(b.sort))
    .map((row) => ({
      id: row.id,
      name: row.effect_name || row.name,
      tag: row.tag || '无',
      // 配置里 icon 是图标文件名（如 frozen/love/dark），没有才退回按 id
      image: mutantImage(row),
      effect: mutationEffectText(row),
      description: row.tips || row.description || '',
      probabilities: probabilities
        .filter((entry) => entry.mutant_id === row.id)
        .map((entry) => ({ rarity: entry.rarity, percent: entry.public_probability / 100 })),
    }));

  return {
    normal: effects.filter((row) => row.tag === '无'),
    decoration: effects.filter((row) => row.tag === '装扮'),
    collections: seriesConfig
      .filter((row) => Number(row.category) === CATEGORY && !row.display)
      .sort((a, b) => a.display_order - b.display_order)
      .map((row) => ({
        id: row.series_id,
        name: row.series_name,
        rarityName: rarityNames[row.series_rarity] || '',
        description: row.desc || '',
        mutationRules: mutationRules(row.series_id),
        items: itemConfig
          .filter((item) => item.series_id === row.series_id)
          .sort((a, b) => a.display_order - b.display_order)
          .map((item) => ({
            id: item.item_id,
            name: getItemById(item.item_id)?.name || `藏品${item.item_id}`,
            image: getItemImageById(item.item_id),
          })),
      })),
  };
}

/** 仅在配置文件被替换后重新加载（配置表同步脚本会调用） */
function reloadCollectionsConfig() {
  cache = null;
}

module.exports = {
  getCollectionsSnapshot,
  normalizeCollections,
  getMutationCatalog,
  reloadCollectionsConfig,
  CATEGORY,
};
