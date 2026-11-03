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
const DISPLAY_SLOT = 1;
let mutationTail = Promise.resolve();
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

/** 判断 unlock_condition_ids 是否全部满足（仅支持 condition_type=3：同系列 N 件达到 X 星） */
function conditionsMet(value, owned) {
  if (!value) return true;
  const { conditions, items } = configs();
  return String(value)
    .split(';')
    .filter(Boolean)
    .every((id) => {
      const condition = conditions.find((row) => Number(row.condition_id) === Number(id));
      if (!condition || Number(condition.condition_type) !== 3) return false;
      const ids = items
        .filter((item) => Number(item.series_id) === Number(condition.target_series_id))
        .map((item) => String(item.item_id));
      const reached = ids.filter((itemId) => Number(owned.get(itemId)?.star_level || 0) >= Number(condition.required_star_level));
      return reached.length >= Number(condition.required_count);
    });
}

/** 把服务端 GetCollectionsReply 归一成前端使用的结构 */
function normalizeCollections(reply) {
  const { series: seriesConfig, items: itemConfig, stars: starConfig, scores: scoreConfig, rewards: rewardConfig, pedestals: pedestalConfig, buffs } = configs();

  const detail = (reply.details || []).find((row) => Number(row.category) === CATEGORY);
  if (!detail) throw new Error('当前账号未返回蓝晶藏品信息');

  const owned = new Map((detail.collections || []).map((row) => [quantity(row.collection_id), row]));
  const display = (reply.display_slots || []).find((row) => Number(row.slot_type) === DISPLAY_SLOT && Number(row.display?.category) === CATEGORY)?.display;
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
          const unlocked = conditionsMet(row.unlock_condition_ids, owned) && conditionsMet(item.unlock_condition_ids, owned);
          const nextStarCosts = rewards(nextStar?.items_need || null, item.item_id);
          const copiesNeeded = nextStarCosts.find((cost) => cost.itemId === item.item_id)?.count;
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
            requirements: [...conditionText(row.unlock_condition_ids), ...conditionText(item.unlock_condition_ids)],
            nextStarCosts,
            unlocked,
            canUpgrade: unlocked && starLevel < 5 && Boolean(copiesNeeded) && BigInt(quantity(state?.own_count)) >= BigInt(copiesNeeded),
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

/** 直接读取一次藏品原始回包（不做并发合并，写操作用它拿最新状态） */
async function readCollectionsReply() {
  const { sendMsgAsync } = require('../utils/network');
  const { types } = require('../utils/proto');
  const body = types.GetCollectionsRequest.encode({ categories: [CATEGORY] }).finish();
  const reply = await sendMsgAsync('gamepb.collectionpb.CollectionService', 'GetCollections', body);
  return types.GetCollectionsReply.decode(reply.body);
}

/** 读取藏品快照，并发调用合并成一次请求；fresh=true 时强制重读 */
function getCollectionsSnapshot(options = {}) {
  if (options.fresh) return readCollectionsReply().then(normalizeCollections);
  if (pendingSnapshot) return pendingSnapshot;
  const request = readCollectionsReply().then(normalizeCollections);
  pendingSnapshot = request;
  request
    .finally(() => {
      if (pendingSnapshot === request) pendingSnapshot = null;
    })
    .catch(() => {});
  return request;
}

function collectionError(code, message) {
  return Object.assign(new Error(message), { code });
}

function collectionId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw collectionError('INVALID_ARGUMENT', '藏品编号无效');
  const { items } = configs();
  if (!items.some((item) => Number(item.item_id) === id)) throw collectionError('INVALID_ARGUMENT', '藏品编号无效');
  return id;
}

function costSignature(costs) {
  return (Array.isArray(costs) ? costs : [])
    .map((cost) => `${cost?.itemId}:${cost?.count}`)
    .sort()
    .join('|');
}

/** 背包里某物品的可用数量（含锁定数量），用于写操作前核对余额 */
async function bagBalance(itemId) {
  const warehouse = require('./warehouse');
  const bag = await warehouse.getBag({ fresh: true });
  let total = 0n;
  let locked = 0n;
  const rows = warehouse.getBagItems(bag).filter((row) => Number(row.id) === itemId);
  for (const row of rows) {
    const count = BigInt(quantity(row.count));
    if (count < 0n) throw collectionError('BALANCE_UNKNOWN', '物品余额无法确认');
    total += count;
    if (row.locked === true) locked += count;
  }
  return { resourceKey: `item:${itemId}`, state: 'known', total: String(total), locked: String(locked) };
}

/** 升星/激活前的核对：当前星级、解锁状态、材料与余额 */
async function prepareCollectionUpgrade(input = {}) {
  const id = collectionId(input.collectionId);
  const level = input.expectedStarLevel;
  if (!Number.isInteger(level) || level < 0 || level >= 5) throw collectionError('INVALID_ARGUMENT', '请提供当前藏品星级（0–4）');
  const raw = await readCollectionsReply();
  const snapshot = normalizeCollections(raw);
  const item = snapshot.series.flatMap((series) => series.items).find((row) => row.id === id);
  if (!item) throw collectionError('INVALID_ARGUMENT', '藏品编号无效');
  if (item.starLevel !== level) throw collectionError('COLLECTION_STATE_CHANGED', '藏品星级已变化，请刷新后重新确认');
  if (!item.unlocked) throw collectionError('COLLECTION_LOCKED', '尚未满足藏品解锁条件');
  if (!item.nextStarCosts.length) throw collectionError('COLLECTION_COST_UNKNOWN', '升星材料无法确认');
  if (input.expectedCosts !== undefined && costSignature(input.expectedCosts) !== costSignature(item.nextStarCosts)) {
    throw collectionError('PRICE_CHANGED', '激活或升星材料已变化，请重新确认');
  }
  const balances = [];
  for (const cost of item.nextStarCosts) {
    const balance = cost.itemId === id
      ? { resourceKey: `item:${id}`, state: 'known', total: item.ownCount, locked: '0' }
      : await bagBalance(cost.itemId);
    if (BigInt(balance.total) - BigInt(balance.locked) < BigInt(cost.count)) {
      throw collectionError('INSUFFICIENT_BALANCE', `${cost.name}不足，需要 ${cost.count}`);
    }
    balances.push(balance);
  }
  return {
    raw,
    snapshot,
    item,
    balances,
    costs: item.nextStarCosts.map((cost) => ({ resourceKey: `item:${cost.itemId}`, amount: cost.count })),
    expected: {
      starLevel: level,
      costs: item.nextStarCosts.map((cost) => ({ itemId: cost.itemId, count: cost.count })),
    },
  };
}

async function sendCollectionMutation(method, input) {
  const { types } = require('../utils/proto');
  const { sendMsgAsync } = require('../utils/network');
  pendingSnapshot = null;
  const body = types[`${method}Request`].encode(input).finish();
  const reply = await sendMsgAsync('gamepb.collectionpb.CollectionService', method, body);
  return types[`${method}Reply`].decode(reply.body);
}

function unconfirmed() {
  throw collectionError('COLLECTION_RESULT_UNKNOWN', '藏品操作结果无法确认，请刷新核对，不要重复提交');
}

/** 同账号藏品写操作串行执行，避免并发改同一份状态 */
function serializeMutation(operation) {
  const result = mutationTail.then(operation, operation);
  mutationTail = result.then(() => undefined, () => undefined);
  return result;
}

async function upgradeCollection(input = {}) {
  return serializeMutation(async () => {
    const plan = await prepareCollectionUpgrade(input);
    const reply = await sendCollectionMutation('UpgradeCollection', { category: CATEGORY, collection_id: plan.item.id });
    const copies = plan.item.nextStarCosts.find((cost) => cost.itemId === plan.item.id);
    const expectedCount = BigInt(plan.item.ownCount) - BigInt(copies.count);
    if (
      Number(reply.category) !== CATEGORY
      || Number(reply.collection_id) !== plan.item.id
      || Number(reply.star_level) !== plan.item.starLevel + 1
      || BigInt(quantity(reply.own_count)) !== expectedCount
    ) {
      unconfirmed();
    }
    const series = plan.snapshot.series.find((row) => row.items.some((item) => item.id === plan.item.id));
    const { scores: scoreConfig } = configs();
    const scoreEntry = scoreConfig.find((row) => Number(row.category) === CATEGORY && Number(row.star_level) === Number(reply.star_level));
    const scoreValues = scoreEntry ? String(scoreEntry.score).split(';') : [];
    const nextItemScore = Number(scoreValues[Number(series?.rarity) - 1]) || 0;
    if (!scoreEntry || Number(reply.current_score) !== plan.snapshot.score - plan.item.score + nextItemScore) unconfirmed();
    for (const cost of plan.item.nextStarCosts.filter((row) => row.itemId !== plan.item.id)) {
      const before = plan.balances.find((balance) => balance.resourceKey === `item:${cost.itemId}`);
      const after = await bagBalance(cost.itemId);
      if (BigInt(after.total) !== BigInt(before.total) - BigInt(cost.count)) unconfirmed();
    }
    const detail = plan.raw.details.find((row) => Number(row.category) === CATEGORY);
    const ownedRow = (detail.collections || []).find((row) => Number(row.collection_id) === plan.item.id);
    if (ownedRow) Object.assign(ownedRow, { star_level: reply.star_level, own_count: reply.own_count });
    detail.current_score = reply.current_score;
    return { snapshot: normalizeCollections(plan.raw), costs: plan.costs };
  });
}

async function claimCollectionRewards() {
  return serializeMutation(async () => {
    const raw = await readCollectionsReply();
    const snapshot = normalizeCollections(raw);
    const eligible = snapshot.milestones.filter((row) => row.reached && !row.claimed);
    if (!eligible.length) return { snapshot, skipped: true };
    const reply = await sendCollectionMutation('ClaimCollectionReward', { category: CATEGORY });
    if (
      Number(reply.current_score) < snapshot.score
      || Number(reply.claimed_reward_score) < eligible[eligible.length - 1].score
      || Number(reply.claimed_reward_score) > Number(reply.current_score)
    ) {
      unconfirmed();
    }
    const detail = raw.details.find((row) => Number(row.category) === CATEGORY);
    Object.assign(detail, { current_score: reply.current_score, claimed_reward_score: reply.claimed_reward_score });
    return {
      snapshot: normalizeCollections(raw),
      claimedScores: reply.claimed_scores,
      rewards: (reply.total_rewards || []).map((item) => ({
        id: Number(item.id),
        name: getItemById(Number(item.id))?.name || `物品${item.id}`,
        count: quantity(item.count),
      })),
    };
  });
}

async function setCollectionDisplay(input = {}) {
  const id = collectionId(input.collectionId);
  if (typeof input.displayed !== 'boolean') throw collectionError('INVALID_ARGUMENT', '请指定展示或取消展示');
  return serializeMutation(async () => {
    const raw = await readCollectionsReply();
    const snapshot = normalizeCollections(raw);
    const item = snapshot.series.flatMap((series) => series.items).find((row) => row.id === id);
    if (!item || !item.activated) throw collectionError('COLLECTION_NOT_ACTIVE', '请先激活藏品');
    const current = snapshot.display?.itemId || '0';
    if (input.expectedDisplayItemId !== undefined && String(input.expectedDisplayItemId) !== String(current)) {
      throw collectionError('COLLECTION_STATE_CHANGED', '展示藏品已变化，请刷新后重新确认');
    }
    if ((input.displayed && current === String(id)) || (!input.displayed && current !== String(id))) {
      return { snapshot, skipped: true };
    }
    const target = input.displayed ? id : 0;
    const reply = await sendCollectionMutation('SwitchSceneDisplay', {
      display_slot: { slot_type: DISPLAY_SLOT, display: { category: CATEGORY, item_id: target } },
    });
    const slot = reply.display_slot;
    if (
      Number(slot?.slot_type) !== DISPLAY_SLOT
      || Number(slot?.display?.category) !== CATEGORY
      || Number(slot?.display?.item_id) !== target
    ) {
      unconfirmed();
    }
    raw.display_slots = [...(raw.display_slots || []).filter((row) => Number(row.slot_type) !== DISPLAY_SLOT), slot];
    return { snapshot: normalizeCollections(raw) };
  });
}

/** 藏品写操作入口：upgrade（激活/升星）/ claim（领评分奖励）/ display（展示或取消） */
function operateCollections(action, input = {}) {
  if (action === 'upgrade') return upgradeCollection(input);
  if (action === 'claim') return claimCollectionRewards();
  if (action === 'display') return setCollectionDisplay(input);
  return Promise.reject(collectionError('INVALID_ARGUMENT', '未知的藏品操作'));
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
  prepareCollectionUpgrade,
  upgradeCollection,
  claimCollectionRewards,
  setCollectionDisplay,
  operateCollections,
  reloadCollectionsConfig,
  CATEGORY,
};
