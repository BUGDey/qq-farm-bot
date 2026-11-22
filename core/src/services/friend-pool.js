/**
 * 好友号池 - 全账号共享的加好友链接库 + 按账号分开的申请状态
 *
 * 需求（用户 2026-11-21）：
 * - 链接库全账号共享：同一批分享卡片任何账号都能用，不用重复粘贴
 * - 申请时间/次数/是否不可加**按账号分开**：每个账号的每日次数与好友关系都不同
 * - 面板不展示具体是哪个 QQ/微信账号
 *
 * 存储：data/friend-pool.json（json-db 原子写）
 * {
 *   version: 2,
 *   items:   { [uid]: { uid, openid, shareSource, docId, shareKey, cardTime, name, level,
 *                        visitClosed, visitClosedAt, firstSeenAt, updatedAt } },
 *   applies: { [accountId]: { [uid]: { status, lastApplyAt, applyCount, deadAt, deadReason, updatedAt } } },
 *   limits:  { [accountId]: { dateKey: 'YYYY-MM-DD', at: number, error: string } }
 * }
 *
 * limits 记录「该账号今天已经撞过好友申请上限（1005027）」。
 * 上限是账号级的自然日额度，撞一次后当天任何批次都不可能成功，
 * 记下来才能让后续批次（含重新点按钮、定时任务）直接跳过而不是白跑。
 *
 * 状态判定是惰性的：读取时按 lastApplyAt 推导 pending 是否超期（24h → dead），写回磁盘。
 */
const { getDataFile } = require('../config/runtime-paths');
const { readTextFile, writeTextFileAtomic } = require('./json-db');
const { log } = require('../utils/utils');
const fs = require('node:fs');

/** 申请后等待通过的窗口：超过仍未通过就显示为「已过期」（不是失败，只是还没同意） */
const APPLY_PENDING_WINDOW_MS = 24 * 60 * 60 * 1000;

const POOL_VERSION = 2;

/** @type {{version:number, items:Object<string,Object>, applies:Object<string,Object>}|null} */
let poolCache = null;
/** 缓存对应的文件 mtime + 大小：worker 与主进程都会写同一文件，靠它感知对方改动 */
let poolCacheMtime = -1;
let poolCacheSize = -1;

function getPoolFilePath() {
  return getDataFile('friend-pool.json');
}

function currentFileStat() {
  try {
    const st = fs.statSync(getPoolFilePath());
    return { mtime: st.mtimeMs, size: st.size };
  } catch {
    return { mtime: -1, size: -1 };
  }
}

function currentFileMtime() {
  return currentFileStat().mtime;
}

function emptyPool() {
  return {
    version: POOL_VERSION,
    items: {},
    applies: {},
    limits: {},
    // 按账号保存的加好友筛选条件（等级区间 + 犬种），账号之间互不影响
    filters: {},
    // 按账号保存的好友数趋势点，用于前端折线图
    trend: {},
    // 每日自动读取等级的执行记录：{ lastRunDay, lastRunAt, lastAccountId, lastResult }
    autoRead: {},
  };
}

/** 等级筛选上限（游戏内等级上限，参考实现同样用 175 封顶） */
const MAX_FARM_LEVEL = 400;
/** 筛选可选的犬种；『无狗』表示对方农场没有护主犬 */
const DOG_BREEDS = ['无狗', '比熊犬', '柯基', '斑点狗', '牧羊犬', '田园犬', '护主犬', '未知'];
const NO_DOG = '无狗';
/** 有狗但读不出品种（或还没读过）都算未知 */
const UNKNOWN_BREED = '未知';
/** 能写进条目的犬种：无狗/未知是推导出来的结论，不作为识别结果存储 */
const STORABLE_BREEDS = DOG_BREEDS.filter((breed) => breed !== NO_DOG && breed !== UNKNOWN_BREED);
/** 好友数趋势最多保留的点数与最小采样间隔（10 分钟） */
const TREND_MAX_POINTS = 96;
const TREND_MIN_GAP_MS = 10 * 60 * 1000;

/** 本地自然日 key（当日上限按本机时区的自然日重置） */
function dayKeyOf(ts = Date.now()) {
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function pickCardFields(raw) {
  return {
    openid: String(raw.openid || ''),
    shareSource: raw.shareSource != null ? String(raw.shareSource) : '',
    docId: raw.docId != null ? String(raw.docId) : '',
    shareKey: String(raw.shareKey || ''),
    cardTime: String(raw.cardTime || ''),
    name: raw.name || '',
    level: Number(raw.level) > 0 ? Number(raw.level) : null,
    // 护主犬品种：进来访问农场时从 EnterReply.brief_dog_info 解析出来的名字
    dogBreed: raw.dogBreed ? String(raw.dogBreed) : '',
  };
}

function normalizeItem(raw) {
  const card = pickCardFields(raw);
  const item = {
    uid: String(raw.uid || ''),
    ...card,
    firstSeenAt: raw.firstSeenAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
  // 拜访关闭：申请时服务端返回 1002007（卡片信息能读到，但对方不让拜访）
  if (raw.visitClosed) {
    item.visitClosed = true;
    item.visitClosedAt = Number(raw.visitClosedAt) || Date.now();
  }
  return item;
}

function savePool() {
  if (!poolCache) return;
  try {
    writeTextFileAtomic(getPoolFilePath(), JSON.stringify(poolCache, null, 2));
    const stat = currentFileStat();
    poolCacheMtime = stat.mtime;
    poolCacheSize = stat.size;
  } catch (err) {
    log('号池', `号池写入失败: ${err.message}`, { module: 'friend-pool' });
  }
}

/**
 * 判断导入的卡片是否应覆盖号池里已有的卡片信息
 * - 两边都有卡片时间：按时间比较，更旧的不覆盖（时间相同视为同一张，允许刷新）
 * - 导入侧没有时间（txt 链接格式）：视为「刚粘贴进来的新卡片」，允许覆盖
 *   理由：链接是提取脚本按卡片时间取最新后导出的，粘贴即最新一次提取
 */
function shouldReplaceCard(existing, incoming) {
  const incomingTime = String((incoming && incoming.cardTime) || '');
  const existingTime = String((existing && existing.cardTime) || '');
  if (incomingTime && existingTime) return incomingTime >= existingTime;
  return true;
}

/**
 * 把 v1（每个账号各存一份完整条目）迁移成 v2（共享链接 + 按账号状态）
 * v1: { accounts: { [accountId]: { [uid]: entry } } }
 */
function migrateLegacyPool(raw) {
  const pool = emptyPool();
  const accounts = (raw && raw.accounts) || {};
  for (const accountId of Object.keys(accounts)) {
    const entries = accounts[accountId] || {};
    const stateMap = {};
    for (const uid of Object.keys(entries)) {
      const entry = entries[uid] || {};
      const incoming = {
        openid: entry.openid,
        shareSource: entry.shareSource,
        docId: entry.docId,
        shareKey: entry.shareKey,
        cardTime: entry.cardTime,
        name: entry.name,
        level: entry.level,
        firstSeenAt: entry.firstSeenAt || entry.updatedAt || Date.now(),
      };
      const existing = pool.items[uid];
      if (!existing) {
        pool.items[uid] = normalizeItem({ uid, ...incoming });
      }
      else if (shouldReplaceCard(existing, incoming)) {
        // 只覆盖有值的字段，避免另一个账号的空昵称/等级把已有信息抹掉
        const card = pickCardFields(incoming);
        if (card.shareKey) existing.shareKey = card.shareKey;
        if (card.openid) existing.openid = card.openid;
        if (card.shareSource) existing.shareSource = card.shareSource;
        if (card.docId) existing.docId = card.docId;
        if (card.cardTime) existing.cardTime = card.cardTime;
        if (card.name) existing.name = card.name;
        if (card.level) existing.level = card.level;
        existing.updatedAt = Date.now();
      }
      stateMap[uid] = {
        status: entry.status || 'new',
        lastApplyAt: entry.lastApplyAt || null,
        applyCount: Number(entry.applyCount) || 0,
        deadAt: entry.deadAt || null,
        deadReason: entry.deadReason || '',
        updatedAt: entry.updatedAt || Date.now(),
      };
    }
    pool.applies[String(accountId)] = stateMap;
  }
  log('号池', `号池已迁移到共享格式：链接 ${Object.keys(pool.items).length} 条，账号 ${Object.keys(pool.applies).length} 个`, { module: 'friend-pool' });
  return pool;
}

function loadPool() {
  const stat = currentFileStat();
  const mtime = stat.mtime;
  // mtime 只到毫秒：同一毫秒内被重写时靠文件大小兜底，避免读到旧缓存
  if (poolCache && mtime === poolCacheMtime && stat.size === poolCacheSize) return poolCache;

  let parsed = null;
  try {
    const raw = readTextFile(getPoolFilePath(), '');
    parsed = raw ? JSON.parse(raw) : null;
  } catch (err) {
    log('号池', `号池文件损坏，已重置: ${err.message}`, { module: 'friend-pool' });
    parsed = null;
  }

  if (parsed && parsed.version === POOL_VERSION && parsed.items && parsed.applies) {
    poolCache = parsed;
  }
  else if (parsed && parsed.accounts) {
    poolCache = migrateLegacyPool(parsed);
    poolCacheMtime = mtime;
    poolCacheSize = stat.size;
    savePool();
    return poolCache;
  }
  else {
    poolCache = emptyPool();
  }

  if (!poolCache.items || typeof poolCache.items !== 'object') poolCache.items = {};
  if (!poolCache.applies || typeof poolCache.applies !== 'object') poolCache.applies = {};
  // 老文件没有 limits：补一个空表，不打乱已有数据
  if (!poolCache.limits || typeof poolCache.limits !== 'object') poolCache.limits = {};
  // 筛选条件与趋势是后加的字段，老文件同样补空表
  if (!poolCache.filters || typeof poolCache.filters !== 'object') poolCache.filters = {};
  if (!poolCache.trend || typeof poolCache.trend !== 'object') poolCache.trend = {};
  if (!poolCache.autoRead || typeof poolCache.autoRead !== 'object') poolCache.autoRead = {};
  poolCacheMtime = mtime;
  poolCacheSize = stat.size;
  return poolCache;
}

/** 号池里还没读到等级/犬种的条目（自动读取用，只取有 share_key 的） */
function getItemsMissingProfile(limit = 20) {
  const pool = loadPool();
  return Object.values(pool.items)
    .filter((item) => item && item.shareKey
    && (!(Number(item.level) > 0) || (!item.dogBreed && item.dogAbsent !== true)))
    .sort((a, b) => Number(a.updatedAt || 0) - Number(b.updatedAt || 0))
    .slice(0, Math.max(1, Number(limit) || 20));
}

function getAutoReadState() {
  const pool = loadPool();
  return { ...(pool.autoRead || {}) };
}

function markAutoReadRun(info = {}) {
  const pool = loadPool();
  const previous = pool.autoRead || {};
  const nowMs = Number(info.now) > 0 ? Number(info.now) : Date.now();
  const accounts = (previous.accounts && typeof previous.accounts === 'object') ? { ...previous.accounts } : {};
  const accountId = String(info.lastAccountId || '');
  // 每个账号单独记上次读取时间：读取后该账号冷却 24 小时，冷却结束才开新一轮
  if (accountId) accounts[accountId] = { lastRunAt: nowMs };
  pool.autoRead = {
    lastRunDay: dayKeyOf(),
    lastRunAt: nowMs,
    lastAccountId: accountId,
    lastResult: info.lastResult || {},
    accounts,
  };
  savePool();
  return pool.autoRead;
}

/** 某个账号的申请状态表（懒创建） */
function getAccountApplies(accountId) {
  const pool = loadPool();
  const key = String(accountId || 'default');
  if (!pool.applies[key] || typeof pool.applies[key] !== 'object') {
    pool.applies[key] = {};
  }
  return pool.applies[key];
}

/**
 * 推导某个「账号-链接」的申请状态
 * - friend：已在好友列表
 * - dead：上次申请超过 24h 仍未通过
 * - pending：已申请、等待通过中
 * - new：从未申请过
 */
function computeStatus(state, now = Date.now()) {
  if (!state) return 'new';
  if (state.status === 'friend') return 'friend';
  if (state.status === 'dead') {
    // 旧版本把「24 小时没通过」落盘成 dead；这类记录按已过期显示，
    // 只有真正的拒绝/失败（其它 reason）才继续算已拒绝。
    if (/超过\s*24\s*小时/.test(String(state.deadReason || ''))) return 'expired';
    return 'dead';
  }
  if (state.lastApplyAt && now - state.lastApplyAt >= APPLY_PENDING_WINDOW_MS) {
    return 'expired';
  }
  if (state.lastApplyAt) return 'pending';
  return 'new';
}


/**
 * 同一个人在不同卡片里可能带着不同 uid 出现（重新分享、换 doc_id 等），
 * 只按 uid 去重会越导越多。真正能区分「人」的是 openid，没有 openid 时退到 share_key。
 */
function identityOf(item) {
  if (!item) return '';
  const openid = String(item.openid || '').trim();
  if (openid) return `openid:${openid}`;
  const shareKey = String(item.shareKey || item.share_key || '').trim();
  if (shareKey) return `key:${shareKey}`;
  return `uid:${String(item.uid || '').trim()}`;
}

/** 卡片更新时间：有 cardTime 比 cardTime，否则比 updatedAt */
function newerCard(a, b) {
  const ta = String((a && a.cardTime) || '');
  const tb = String((b && b.cardTime) || '');
  // 返回 >0 表示 a 的卡片比 b 新
  if (ta !== tb) return ta > tb ? 1 : -1;
  return Number((b && b.updatedAt) || 0) - Number((a && a.updatedAt) || 0);
}

const STATUS_RANK = { friend: 4, pending: 3, dead: 2, new: 1 };

/**
 * 清理号池里的重复好友：同一个人只保留卡片最新的一条，其余删除。
 * 被删条目的申请状态会迁移到保留的那条（好友 > 待通过 > 不可加 > 未申请）。
 * @returns {number} 删除条数
 */
function dedupePool() {
  const pool = loadPool();
  const groups = new Map();
  for (const [uid, item] of Object.entries(pool.items)) {
    const key = identityOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(uid);
  }
  let removed = 0;
  for (const uids of groups.values()) {
    if (uids.length < 2) continue;
    let chosen = uids[0];
    for (const uid of uids) {
      if (newerCard(pool.items[uid], pool.items[chosen]) > 0) chosen = uid;
    }
    const keep = pool.items[chosen];
    for (const uid of uids) {
      if (uid === chosen) continue;
      const dup = pool.items[uid];
      // 卡片字段缺什么补什么，保留的 uid 不变（申请状态都是按 uid 存的）
      if (!keep.openid && dup.openid) keep.openid = dup.openid;
      if (!keep.shareKey && dup.shareKey) keep.shareKey = dup.shareKey;
      if (!keep.shareSource && dup.shareSource) keep.shareSource = dup.shareSource;
      if (!keep.docId && dup.docId) keep.docId = dup.docId;
      if (!keep.name && dup.name) keep.name = dup.name;
      if (!(Number(keep.level) > 0) && Number(dup.level) > 0) {
        keep.level = dup.level;
        keep.levelFetchedAt = dup.levelFetchedAt || keep.levelFetchedAt;
      }
      if (!keep.dogBreed && dup.dogBreed) {
        keep.dogBreed = dup.dogBreed;
        keep.dogFetchedAt = dup.dogFetchedAt || keep.dogFetchedAt;
      }
      for (const accountId of Object.keys(pool.applies)) {
        const applies = pool.applies[accountId];
        if (!applies || !applies[uid]) continue;
        if (!applies[chosen]
            || (STATUS_RANK[applies[uid].status] || 0) > (STATUS_RANK[applies[chosen].status] || 0)) {
          applies[chosen] = applies[uid];
        }
        delete applies[uid];
      }
      delete pool.items[uid];
      removed++;
    }
    if (removed > 0) keep.updatedAt = Date.now();
  }
  if (removed > 0) savePool();
  return removed;
}

/**
 * 合并导入的链接到**共享链接库**（与账号无关）。同一 uid 只保留一条：
 * - 卡片信息（share_key/openid/share_source/card_time）以卡片实际时间为准更新；
 *   无卡片时间的导入（txt 链接）视为最新卡片直接覆盖
 * - 申请历史属于各账号，这里完全不碰
 *
 * @param {Array<{uid:string, openid:string, shareSource?:string, docId?:string, shareKey?:string, cardTime?:string}>} items
 * @returns {{added:number, updated:number}}
 */
function upsertInviteItems(items) {
  // 导入前先把历史遗留的重复清掉，避免「重复导入数量还在涨」
  let removed = dedupePool();
  const pool = loadPool();
  const shared = pool.items;
  let added = 0;
  let updated = 0;

  // 身份索引：同一个人换了 uid 也认成同一条
  const identityOwner = new Map();
  for (const [uid, entry] of Object.entries(shared)) {
    identityOwner.set(identityOf({ ...entry, uid }), uid);
  }

  for (const item of Array.isArray(items) ? items : []) {
    const uid = String((item && item.uid) || '').trim();
    if (!uid) continue;

    const incoming = {
      openid: String((item && (item.openid || item.openId)) || '').trim(),
      shareSource: item && item.shareSource != null ? String(item.shareSource) : '',
      docId: item && item.docId != null ? String(item.docId) : '',
      shareKey: String((item && (item.shareKey || item.share_key)) || '').trim(),
      cardTime: item && item.cardTime != null ? String(item.cardTime) : '',
    };

    const identity = identityOf({ uid, ...incoming });
    const ownerUid = shared[uid] ? uid : identityOwner.get(identity);
    const targetUid = ownerUid || uid;
    const existing = shared[targetUid];
    if (!existing) {
      shared[uid] = normalizeItem({ uid, ...incoming });
      identityOwner.set(identity, uid);
      added++;
      continue;
    }
    if (targetUid !== uid) updated++;

    if (targetUid !== uid) { /* 已在上面计过 */ }
    else updated++;
    if (!shouldReplaceCard(existing, incoming)) continue;

    if (incoming.shareKey && incoming.shareKey !== existing.shareKey) existing.shareKey = incoming.shareKey;
    if (incoming.openid) existing.openid = incoming.openid;
    if (incoming.shareSource) existing.shareSource = incoming.shareSource;
    if (incoming.docId) existing.docId = incoming.docId;
    if (incoming.cardTime && incoming.cardTime !== existing.cardTime) existing.cardTime = incoming.cardTime;
    existing.updatedAt = Date.now();
  }

  removed += dedupePool();
  savePool();
  return { added, updated, removed };
}

/** 发出申请后记录（只影响该账号） */
function markApplied(accountId, uid, extra = {}) {
  const pool = loadPool();
  const key = String(uid);
  const shared = pool.items[key];
  if (shared) {
    if (extra.shareKey) shared.shareKey = String(extra.shareKey);
    if (extra.cardTime && String(extra.cardTime) > (shared.cardTime || '')) shared.cardTime = String(extra.cardTime);
    if (extra.name) shared.name = String(extra.name);
    if (Number(extra.level) > 0) shared.level = Number(extra.level);
    // 能申请成功说明拜访是通的，之前的「拜访关闭」标记作废
    if (shared.visitClosed) {
      delete shared.visitClosed;
      delete shared.visitClosedAt;
    }
    shared.updatedAt = Date.now();
  }

  const applies = getAccountApplies(accountId);
  const state = applies[key] || { status: 'new', applyCount: 0, lastApplyAt: null };
  state.lastApplyAt = Date.now();
  state.applyCount = (state.applyCount || 0) + 1;
  state.status = 'pending';
  state.deadAt = null;
  state.deadReason = '';
  state.updatedAt = Date.now();
  applies[key] = state;
  savePool();
}

/**
 * 只更新共享条目上的资料（昵称 / 等级），不改任何账号的申请状态。
 * 用于「读取等级」：进入对方农场拿到等级后写回号池，后续可按等级筛选加好友。
 */
function updateItemProfile(uid, extra = {}) {
  const pool = loadPool();
  const key = String(uid);
  const shared = pool.items[key];
  if (!shared) return false;
  let changed = false;
  const name = extra.name == null ? '' : String(extra.name).trim();
  if (name && name !== shared.name) {
    shared.name = name;
    changed = true;
  }
  const level = Number(extra.level);
  if (Number.isFinite(level) && level > 0 && level !== shared.level) {
    shared.level = level;
    changed = true;
  }
  // 犬种：识别出来才写；识别不出（空串）保留原值，避免把已知品种覆盖成未知
  const dogBreed = extra.dogBreed == null ? '' : String(extra.dogBreed).trim();
  if (dogBreed && STORABLE_BREEDS.includes(dogBreed)) {
    if (shared.dogBreed !== dogBreed) {
      shared.dogBreed = dogBreed;
      changed = true;
    }
    if (shared.dogAbsent) {
      delete shared.dogAbsent;
      changed = true;
    }
  } else if (extra.dogAbsent === true) {
    // 明确读到「没有狗」：清掉旧品种，避免无狗和旧品种同时存在
    if (shared.dogBreed) {
      delete shared.dogBreed;
      changed = true;
    }
    if (shared.dogAbsent !== true) {
      shared.dogAbsent = true;
      changed = true;
    }
  }
  if (extra.levelFetchedAt) {
    const ts = Number(extra.levelFetchedAt);
    if (Number.isFinite(ts) && ts !== shared.levelFetchedAt) {
      shared.levelFetchedAt = ts;
      changed = true;
    }
  }
  // 犬种识别过一次就记下时间：之后「没品种」才有依据解释成「无狗」，避免把没读过资料的当成无狗
  if (extra.dogFetchedAt) {
    const ts = Number(extra.dogFetchedAt);
    if (Number.isFinite(ts) && ts !== shared.dogFetchedAt) {
      shared.dogFetchedAt = ts;
      changed = true;
    }
  }
  if (changed) {
    shared.updatedAt = Date.now();
    savePool();
  }
  return changed;
}

/**
 * 标记「拜访已恢复」：读取等级 / 申请时 Enter 成功，就把之前的拜访关闭状态清掉。
 *
 * 拜访开关是对方的设置，随时可能被重新打开；读等级本来就要 Enter 一次，
 * 顺手把这个状态纠正过来，面板上就不会一直显示「拜访关闭」。
 */
function markVisitOpen(uid) {
  const pool = loadPool();
  const item = pool.items[String(uid)];
  if (!item) return false;
  if (!item.visitClosed && !item.visitClosedAt && !item.visitClosedReason) return false;
  delete item.visitClosed;
  delete item.visitClosedAt;
  delete item.visitClosedReason;
  item.updatedAt = Date.now();
  savePool();
  return true;
}

/**
 * 标记「拜访关闭」：申请时 Enter 返回 1002007。
 *
 * 卡片里能读到昵称/等级，但对方关闭了拜访（或我方开关自动打开后仍被拒），
 * 这条链接就没法加好友。记在共享条目上，面板单独统计/筛选，不再反复尝试。
 * 一旦真的申请成功（markApplied）或确认已是好友（markFriend）会自动清掉。
 */
function markVisitClosed(uid, reason = '') {
  const pool = loadPool();
  const key = String(uid);
  const shared = pool.items[key];
  if (!shared) return false;
  shared.visitClosed = true;
  shared.visitClosedAt = Date.now();
  if (reason) shared.visitClosedReason = String(reason);
  shared.updatedAt = Date.now();
  savePool();
  return true;
}

/** 已在好友列表（只影响该账号） */
function markFriend(accountId, uid, extra = {}) {
  const pool = loadPool();
  const key = String(uid);
  if (!pool.items[key]) return false;
  const applies = getAccountApplies(accountId);
  const state = applies[key] || { applyCount: 0, lastApplyAt: null };
  state.status = 'friend';
  state.updatedAt = Date.now();
  applies[key] = state;
  if (extra && extra.name) pool.items[key].name = String(extra.name);
  if (pool.items[key].visitClosed) {
    delete pool.items[key].visitClosed;
    delete pool.items[key].visitClosedAt;
  }
  savePool();
  return true;
}

/** 批量标记好友（好友列表比对后调用，只影响该账号） */
function markFriends(accountId, uids) {
  const pool = loadPool();
  const applies = getAccountApplies(accountId);
  let count = 0;
  for (const uid of Array.isArray(uids) ? uids : []) {
    const key = String(uid);
    if (!pool.items[key]) continue;
    const state = applies[key];
    if (state && state.status === 'friend') continue;
    applies[key] = { ...(state || { applyCount: 0, lastApplyAt: null }), status: 'friend', updatedAt: Date.now() };
    count++;
  }
  if (count > 0) savePool();
  return count;
}

/** 标记不可加（超时未通过，只影响该账号） */
function markDead(accountId, uid, reason) {
  const pool = loadPool();
  const key = String(uid);
  if (!pool.items[key]) return false;
  const applies = getAccountApplies(accountId);
  const state = applies[key] || { applyCount: 0, lastApplyAt: null };
  state.status = 'dead';
  state.deadAt = Date.now();
  state.deadReason = String(reason || '申请超过 24 小时未通过');
  state.updatedAt = Date.now();
  applies[key] = state;
  savePool();
  return true;
}

/** 恢复为可申请（人工解除误判，只影响该账号） */
function resetEntry(accountId, uid) {
  const pool = loadPool();
  const key = String(uid);
  if (!pool.items[key]) return false;
  const applies = getAccountApplies(accountId);
  if (!applies[key]) return false;
  applies[key] = {
    status: 'new',
    lastApplyAt: null,
    applyCount: 0,
    deadAt: null,
    deadReason: '',
    updatedAt: Date.now(),
  };
  savePool();
  return true;
}

/** 从共享链接库删除一条（同时清掉所有账号对它的申请状态） */
function removeEntry(uid) {
  const pool = loadPool();
  const key = String(uid);
  if (!pool.items[key]) return false;
  delete pool.items[key];
  for (const accountId of Object.keys(pool.applies)) {
    if (pool.applies[accountId]) delete pool.applies[accountId][key];
  }
  savePool();
  return true;
}

/**
 * 一次性取出该账号下所有条目的状态（批量流程用，避免逐条读文件/逐条 stat）
 * @returns {Map<string, 'new'|'pending'|'dead'|'friend'>}
 */
function getStatusMap(accountId) {
  const pool = loadPool();
  const applies = getAccountApplies(accountId);
  const now = Date.now();
  const map = new Map();
  for (const uid of Object.keys(pool.items)) {
    map.set(uid, computeStatus(applies[uid], now));
  }
  return map;
}

/**
 * 查询条目在该账号下的状态（不落盘，供流程内快速判定）
 * @returns {'new'|'pending'|'dead'|'friend'|null} 不在共享链接库中返回 null
 */
function peekStatus(accountId, uid) {
  const pool = loadPool();
  const key = String(uid);
  if (!pool.items[key]) return null;
  const applies = getAccountApplies(accountId);
  return computeStatus(applies[key]);
}

/**
 * 该账号今天是否已撞过好友申请上限（1005027）
 *
 * 上限是游戏按账号、按自然日给的额度：撞一次后当天再发只会继续被拒。
 * 记录在号池里，跨天（日期 key 变了）自动失效，不需要额外清理。
 *
 * @returns {{blocked:boolean, dateKey:string, at:number|null, error:string}}
 */
function getDailyLimitState(accountId, now = Date.now()) {
  const pool = loadPool();
  const key = String(accountId || 'default');
  const rec = pool.limits[key];
  if (!rec || !rec.dateKey) return { blocked: false, dateKey: '', at: null, error: '' };
  if (rec.dateKey !== dayKeyOf(now)) return { blocked: false, dateKey: '', at: null, error: '' };
  return {
    blocked: true,
    dateKey: rec.dateKey,
    at: Number(rec.at) || null,
    error: String(rec.error || ''),
  };
}

function isDailyLimitBlocked(accountId, now = Date.now()) {
  return getDailyLimitState(accountId, now).blocked;
}

/** 记录「该账号今天已达好友申请上限」 */
function markDailyLimit(accountId, error) {
  const pool = loadPool();
  const key = String(accountId || 'default');
  pool.limits[key] = { dateKey: dayKeyOf(), at: Date.now(), error: String(error || '') };
  savePool();
}

/** 手动解除当日上限记录（一般不需要：跨天会自动失效） */
function clearDailyLimit(accountId) {
  const pool = loadPool();
  const key = String(accountId || 'default');
  if (!pool.limits[key]) return false;
  delete pool.limits[key];
  savePool();
  return true;
}

/**
 * 某个账号的加好友筛选条件（等级区间 + 犬种）
 * 默认区间 0–175、犬种空数组（= 不限犬种）
 */
function normalizeFilter(filter = {}) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  let minLevel = Math.round(num(filter.minLevel, 0));
  // 最高等级 0 = 不设上限（默认），只有填了正数才作为上限
  let maxLevel = Math.round(num(filter.maxLevel, 0));
  minLevel = Math.min(Math.max(minLevel, 0), MAX_FARM_LEVEL);
  maxLevel = Math.min(Math.max(maxLevel, 0), MAX_FARM_LEVEL);
  if (maxLevel > 0 && minLevel > maxLevel) maxLevel = minLevel;
  const breeds = Array.isArray(filter.dogBreeds) ? filter.dogBreeds : [];
  const dogBreeds = [...new Set(breeds.map((b) => String(b || '').trim()).filter((b) => DOG_BREEDS.includes(b)))];
  return { minLevel, maxLevel, dogBreeds };
}

/** 读取账号保存的筛选条件（没有则回默认值，不落盘） */
function getFilter(accountId) {
  const pool = loadPool();
  const saved = pool.filters[String(accountId || 'default')];
  return normalizeFilter(saved || {});
}

/** 保存账号的筛选条件 */
function setFilter(accountId, filter = {}) {
  const pool = loadPool();
  const key = String(accountId || 'default');
  const normalized = { ...normalizeFilter(filter), updatedAt: Date.now() };
  pool.filters[key] = normalized;
  savePool();
  return normalized;
}

/** 好友数趋势点（最多 96 个） */
function getTrend(accountId) {
  const pool = loadPool();
  const points = pool.trend[String(accountId || 'default')];
  return Array.isArray(points) ? points : [];
}

/**
 * 记录一个好友数趋势点。
 * 好友数是低频变化的数据，10 分钟内不再重复记录，避免刷出一堆同一时刻的点。
 */
function recordTrend(accountId, count, now = Date.now()) {
  const pool = loadPool();
  const key = String(accountId || 'default');
  const points = Array.isArray(pool.trend[key]) ? pool.trend[key] : [];
  const last = points[points.length - 1];
  if (last && now - last.t < TREND_MIN_GAP_MS) return points;
  points.push({ t: now, c: Number(count) || 0 });
  while (points.length > TREND_MAX_POINTS) points.shift();
  pool.trend[key] = points;
  savePool();
  return points;
}

/**
 * 条目的犬种：
 * - 已识别出品种 → 该品种；
 * - 读取过并确认没有狗 → 无狗；
 * - 其余（还没读过 / 有狗但读不出品种）→ 未知。
 * 「无狗」只能来自确认过的结论，不能拿「没读到」来凑。
 */
function breedOfItem(item) {
  if (item.dogBreed && STORABLE_BREEDS.includes(item.dogBreed)) return item.dogBreed;
  return item.dogAbsent ? NO_DOG : UNKNOWN_BREED;
}

/**
 * 按筛选条件统计号池里「这个账号还能加多少人」。
 * 面板上的等级/犬种按钮数量、蓝色可加人数横幅都来自这里。
 */
function computeFilterStats(accountId, filter = {}, options = {}) {
  const normalized = normalizeFilter(filter);
  const pool = loadPool();
  const applies = getAccountApplies(accountId);
  const now = Date.now();
  const items = Object.values(pool.items);

  const dogCounts = {};
  for (const breed of DOG_BREEDS) dogCounts[breed] = 0;
  let identified = 0;
  let poolMaxLevel = 0;
  let addableTotal = 0;
  let matched = 0;

  for (const item of items) {
    const breed = breedOfItem(item);
    const level = Number(item.level) || 0;
    if (breed && Object.hasOwn(dogCounts, breed)) dogCounts[breed]++;
    if (level > 0 || breed) identified++;
    if (level > poolMaxLevel) poolMaxLevel = level;

    const status = computeStatus(applies[String(item.uid)], now);
    const addable = Boolean(item.shareKey) && status === 'new';
    if (addable) addableTotal++;
    if (!addable) continue;

    // 等级没读到的条目：只有显式允许「等级查不到也加」时才计入可加人数
    if (level === 0 && options.allowUnknownLevel !== true) continue;
    if (level > 0 && level < normalized.minLevel) continue;
    if (level > 0 && normalized.maxLevel > 0 && level > normalized.maxLevel) continue;
    if (normalized.dogBreeds.length > 0 && !normalized.dogBreeds.includes(breed)) continue;
    matched++;
  }

  return {
    total: items.length,
    identified,
    coverage: items.length ? Math.round((identified / items.length) * 1000) / 10 : 0,
    poolMaxLevel,
    addableTotal,
    matched,
    dogCounts,
    minLevel: normalized.minLevel,
    maxLevel: normalized.maxLevel,
    dogBreeds: normalized.dogBreeds,
  };
}

/**
 * 共享链接库 + 该账号的申请状态（惰性把超期 pending 落盘为 dead）
 * @returns {{summary:{total:number,new:number,pending:number,friend:number,dead:number}, entries:Array}}
 */
/**
 * 某个账号的申请记录（历史累计，不裁剪）：每次批量添加都会在 applies 里留痕，
 * 申请过的条目即使后来变成好友/失效也还在，所以这里不需要额外存储。
 */
function getApplyRecords(accountId, options = {}) {
  const pool = loadPool();
  const key = String(accountId || 'default');
  const applies = pool.applies[key] && typeof pool.applies[key] === 'object' ? pool.applies[key] : {};
  const now = Date.now();
  const records = [];
  for (const [uid, state] of Object.entries(applies)) {
    const raw = state && typeof state === 'object' ? state : {};
    const lastApplyAt = Number(raw.lastApplyAt) || 0;
    if (lastApplyAt <= 0) continue;
    const item = pool.items[uid] || {};
    records.push({
      uid,
      name: item.name || '',
      level: Number(item.level) || 0,
      status: computeStatus(raw, now),
      applyCount: Number(raw.applyCount) || 0,
      lastApplyAt,
      deadReason: raw.deadReason || '',
    });
  }
  records.sort((a, b) => b.lastApplyAt - a.lastApplyAt);

  const counts = { total: records.length, friend: 0, pending: 0, expired: 0, dead: 0 };
  for (const record of records) {
    if (Object.hasOwn(counts, record.status)) counts[record.status] += 1;
  }
  const limit = Math.max(1, Number(options.limit) || 200);
  return { counts, records: records.slice(0, limit) };
}

function getPoolSnapshot(accountId) {
  const pool = loadPool();
  const applies = getAccountApplies(accountId);
  const now = Date.now();
  const summary = { total: 0, new: 0, pending: 0, expired: 0, friend: 0, dead: 0 };
  const list = [];

  for (const uid of Object.keys(pool.items)) {
    const item = pool.items[uid];
    const state = applies[uid];
    const status = computeStatus(state, now);
    summary.total++;
    summary[status] = (summary[status] || 0) + 1;
    list.push({
      ...item,
      status,
      lastApplyAt: state ? state.lastApplyAt || null : null,
      applyCount: state ? state.applyCount || 0 : 0,
      deadAt: state ? state.deadAt || null : null,
      deadReason: state ? state.deadReason || '' : '',
      hoursSinceApply: state && state.lastApplyAt
        ? Math.round(((now - state.lastApplyAt) / 3600000) * 10) / 10
        : null,
    });
  }
  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return { summary, entries: list };
}

/**
 * 管理后台用的号池总览：不绑定具体账号，返回全部链接 + 所有账号的申请状态汇总。
 *
 * 链接库是全账号共用的，管理后台关心的是「这条链接被多少账号申请过 / 多少账号已经加上 /
 * 多少账号被判定不可加」，而不是某一个账号的明细，所以这里把各账号状态聚合到每一条上。
 */
function getPoolOverview() {
  const pool = loadPool();
  const now = Date.now();

  /** @type {Map<string, {pending:number, friend:number, dead:number}>} */
  const buckets = new Map();
  for (const accountId of Object.keys(pool.applies || {})) {
    const applies = pool.applies[accountId] || {};
    for (const uid of Object.keys(applies)) {
      const status = computeStatus(applies[uid], now);
      if (status === 'new') continue;
      let bucket = buckets.get(uid);
      if (!bucket) {
        bucket = { pending: 0, expired: 0, friend: 0, dead: 0 };
        buckets.set(uid, bucket);
      }
      bucket[status] = (bucket[status] || 0) + 1;
    }
  }

  const entries = Object.values(pool.items).map((item) => {
    const bucket = buckets.get(String(item.uid)) || { pending: 0, expired: 0, friend: 0, dead: 0 };
    return {
      ...item,
      pendingCount: bucket.pending,
      expiredCount: bucket.expired,
      friendCount: bucket.friend,
      deadCount: bucket.dead,
    };
  }).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const visitClosed = entries.filter((item) => item.visitClosed && item.shareKey && item.deadCount === 0).length;
  // 正常 = 有 share_key、没有任何账号把它判成「不可加」、且不是拜访关闭
  const valid = entries.filter((item) => item.shareKey && item.deadCount === 0 && !item.visitClosed).length;
  const summary = {
    total: entries.length,
    withKey: entries.filter((item) => Boolean(item.shareKey)).length,
    applied: entries.filter((item) => item.pendingCount + item.friendCount + item.deadCount > 0).length,
    friend: entries.filter((item) => item.friendCount > 0).length,
    dead: entries.filter((item) => item.deadCount > 0).length,
    valid,
    expired: entries.length - valid - visitClosed,
    visitClosed,
  };

  return { summary, entries };
}

module.exports = {
  APPLY_PENDING_WINDOW_MS,
  MAX_FARM_LEVEL,
  identityOf,
  dedupePool,
  getItemsMissingProfile,
  getAutoReadState,
  markAutoReadRun,
  DOG_BREEDS,
  NO_DOG,
  UNKNOWN_BREED,
  upsertInviteItems,
  markApplied,
  updateItemProfile,
  markVisitClosed,
  markVisitOpen,
  markFriend,
  markFriends,
  markDead,
  resetEntry,
  removeEntry,
  peekStatus,
  getStatusMap,
  getFilter,
  setFilter,
  getTrend,
  recordTrend,
  computeFilterStats,
  getPoolSnapshot,
  getApplyRecords,
  getPoolOverview,
  computeStatus,
  dayKeyOf,
  getDailyLimitState,
  isDailyLimitBlocked,
  markDailyLimit,
  clearDailyLimit,
};
