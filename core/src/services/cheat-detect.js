/**
 * 好友外挂检测服务 - 基于访客互动记录的行为分析
 *
 * 原理：
 * - 挂机/查询过程中每次拉取访客互动记录时，把记录持续累积到本地样本库（72 小时滚动窗口）
 * - 对每个访客从六个维度评分，综合出 0-100 嫌疑分：
 *   1. 操作间隔规律性（真人操作间隔抖动大，脚本间隔高度均匀）
 *   2. 凌晨活跃占比（0-6 点高活跃是典型挂机特征）
 *   3. 日均频率（频率异常偏高）
 *   4. 行为单一性（只会一种动作，如只偷菜）
 *   5. 24 小时在线时长（普通玩家约 2-3 小时/天；4-6 小时起怀疑，
 *      10 小时以上基本是挂机——以最近 24h 有真实操作覆盖的小时数计）
 *   6. 秒偷（我方作物成熟后 60 秒内即被该访客偷走；真人很难连续踩点）
 * - 样本置信阈值：单个访客样本不足 20 条时嫌疑分按样本量线性压缩并封顶在
 *   关注线（30）以下，不标记可疑/高活跃，改标「样本不足」，避免小样本误伤
 * - 护主犬好友（dogId=90021）自动加分保护：嫌疑分强制压低并打上护主犬标记
 */
const fs = require('fs');
const path = require('path');
const { getDataFile } = require('../config/runtime-paths');
const { writeJsonFileAtomic } = require('./json-db');
const { readFriendDogInfoCache } = require('../models/store');
const { logWarn, toTimeSec } = require('../utils/utils');

const SAMPLE_WINDOW_MS = 72 * 60 * 60 * 1000;
const SAMPLE_MAX_ENTRIES = 8000;
/** 秒偷判定：我方作物成熟后多少秒内被偷视为「踩点秒偷」 */
const FAST_STEAL_WINDOW_SEC = 60;
/** 成熟时刻历史最大条数（按时刻去重） */
const MATURE_HISTORY_MAX = 4000;
/** 样本置信阈值：单个访客样本低于该条数时不标记可疑/高活跃，嫌疑分按比例压缩 */
const SAMPLE_MIN_TRUST = 20;
/** 样本不足时嫌疑分封顶值：压在关注线（warn >= 30）之下，保证分数与等级一致 */
const INSUFFICIENT_SAMPLE_SCORE_CAP = 29;

const GUARD_DOG_ID = 90021;

function getSampleDir() {
  const dir = getDataFile('interact_samples');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getSampleFile(accountId) {
  const safeName = String(accountId || '').replace(/[^\w-]/g, '_');
  return path.join(getSampleDir(), `${safeName}.json`);
}

function readSampleData(accountId) {
  try {
    const data = JSON.parse(fs.readFileSync(getSampleFile(accountId), 'utf8'));
    return {
      samples: data && Array.isArray(data.samples) ? data.samples : [],
      // 旧版本文件没有成熟时刻历史，回落为空数组
      matureHistory: data && Array.isArray(data.matureHistory) ? data.matureHistory : [],
    };
  } catch { }
  return { samples: [], matureHistory: [] };
}

function writeSampleData(accountId, samples, matureHistory) {
  try {
    writeJsonFileAtomic(getSampleFile(accountId), {
      samples: samples.slice(-SAMPLE_MAX_ENTRIES),
      matureHistory: (matureHistory || []).slice(-MATURE_HISTORY_MAX),
      updatedAt: Date.now(),
    });
  } catch (err) {
    try {
      logWarn('好友', `外挂检测样本写入失败: ${err && err.message}`, {
        module: 'friend',
        event: 'cheat_samples_save',
        result: 'error',
      });
    } catch { }
  }
}

/**
 * 记录我方农场各地块的成熟时刻（秒），供「秒偷」判定使用。
 * 巡田后调用；成熟时刻 = 该地块 plant.phases 中最大的 begin_time
 * （与 farm-land-analyzer 的成熟时间算法一致）。
 * @param {Array} lands 服务端土地列表（land.plant.phases）
 * @param {number} nowMs
 * @returns {number} 新增的成熟时刻条数
 */
function recordOwnMaturityHistory(lands, now = Date.now()) {
  const accountId = String(process.env.FARM_ACCOUNT_ID || '');
  if (!accountId || !Array.isArray(lands)) return 0;
  const nowSec = Math.floor(now / 1000);
  const horizonSec = nowSec + 36 * 3600; // 只收录 36h 内会发生的成熟
  const data = readSampleData(accountId);
  const known = new Set(data.matureHistory.map((at) => Number(at)));
  let added = 0;
  for (const land of lands) {
    const phases = land && land.plant && Array.isArray(land.plant.phases) ? land.plant.phases : null;
    if (!phases) continue;
    let mature = 0;
    for (const phase of phases) {
      const t = toTimeSec(phase.begin_time);
      if (t > mature) mature = t;
    }
    if (mature <= 0 || mature > horizonSec) continue;
    if (known.has(mature)) continue;
    known.add(mature);
    data.matureHistory.push(mature);
    added += 1;
  }
  const cutoff = Math.floor((now - SAMPLE_WINDOW_MS) / 1000);
  data.matureHistory = data.matureHistory.filter((at) => Number(at) >= cutoff);
  if (added > 0) {
    writeSampleData(accountId, data.samples, data.matureHistory);
  }
  return added;
}

function pruneSamples(samples, now = Date.now()) {
  const cutoff = Math.floor((now - SAMPLE_WINDOW_MS) / 1000);
  return samples.filter((s) => Number(s[0]) >= cutoff);
}

// ---- 挂机过程中的节流采样 ----

const collectState = new Map(); // accountId -> { lastMs, inFlight }

/**
 * 节流拉取访客互动记录并累积样本（默认每账号 30 分钟一次），
 * 供好友巡访循环在挂机过程中调用，不阻塞主流程。
 * @param {string} accountId
 * @param {() => Promise<Array>} fetchFn 拉取互动记录的函数（内部已自动累积样本）
 */
async function collectSamplesThrottled(accountId, fetchFn, throttleMs = 30 * 60 * 1000) {
  if (!accountId || typeof fetchFn !== 'function') return 0;
  const state = collectState.get(accountId) || {};
  const now = Date.now();
  if (state.inFlight || now - (state.lastMs || 0) < throttleMs) return 0;
  state.inFlight = true;
  state.lastMs = now;
  collectState.set(accountId, state);
  try {
    const records = await fetchFn();
    return recordInteractSamples(accountId, records, now);
  } catch {
    return 0;
  } finally {
    state.inFlight = false;
    collectState.set(accountId, state);
  }
}

/**
 * 累积访客互动样本（在拉取互动记录后调用）
 * records: normalizeInteractRecord 输出的记录数组
 * 返回新增样本条数
 */
function recordInteractSamples(accountId, records, now = Date.now()) {
  if (!accountId || !Array.isArray(records) || records.length === 0) return 0;
  const data = readSampleData(accountId);
  const existing = data.samples;
  const seen = new Set(existing.map(([ts, gid, action]) => `${ts}-${gid}-${action}`));
  let added = 0;
  const nowSec = Math.floor(now / 1000);
  for (const record of records) {
    const ts = Number(record.serverTimeSec) || 0;
    const gid = Number(record.visitorGid) || 0;
    const action = Number(record.actionType) || 0;
    if (!ts || !gid || ts > nowSec + 60) continue;
    const key = `${ts}-${gid}-${action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    existing.push([ts, gid, action, Number(record.cropCount) || 0, String(record.nick || '')]);
    added += 1;
  }
  const pruned = pruneSamples(existing, now);
  if (added > 0 || pruned.length !== existing.length) {
    writeSampleData(accountId, pruned, data.matureHistory);
  }
  return added;
}

// ---- 评分 ----

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeRegularityScore(intervals) {
  // 间隔样本不足 3 个时不评判；变异系数（std/mean）越小越像脚本
  if (intervals.length < 3) return { score: 0, cv: null };
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (mean <= 0) return { score: 0, cv: null };
  const cv = stdDev(intervals) / mean;
  let score = 0;
  if (cv < 0.08) score = 20;
  else if (cv < 0.15) score = 14;
  else if (cv < 0.25) score = 8;
  else if (cv < 0.4) score = 3;
  return { score, cv: Number(cv.toFixed(3)) };
}

function computeDawnScore(dawnCount, total) {
  if (!total) return { score: 0, ratio: 0 };
  const ratio = dawnCount / total;
  let score = 0;
  if (ratio >= 0.3) score = 15;
  else if (ratio >= 0.15) score = 8;
  else if (ratio >= 0.08) score = 3;
  return { score, ratio: Number(ratio.toFixed(3)) };
}

function computeFrequencyScore(perDay) {
  let score = 0;
  if (perDay >= 40) score = 15;
  else if (perDay >= 20) score = 10;
  else if (perDay >= 10) score = 5;
  return score;
}

function computeSingleActionScore(actionTypes, total) {
  if (actionTypes.size === 1 && total >= 5) return 10;
  return 0;
}

function computeActiveHoursScore(activeHours24) {
  // 以最近 24 小时有真实操作覆盖的小时数衡量在线时长：
  // 普通玩家 2-3 小时/天属正常；4-6 小时开始怀疑；10 小时以上基本是挂机
  if (activeHours24 >= 10) return 20;
  if (activeHours24 >= 6) return 12;
  if (activeHours24 >= 4) return 6;
  return 0;
}

function computeFastStealScore(fastStealCount, stealCount) {
  // 秒偷：我方作物成熟后极短时间内即被偷走。单次可能是巧遇，
  // 反复踩点（>=2 次）或高频（>=3 次）是典型的成熟监控挂机
  if (fastStealCount >= 3 && stealCount >= 3) return 30;
  if (fastStealCount >= 2) return 20;
  if (fastStealCount >= 1) return 8;
  return 0;
}

/**
 * 综合分析：返回每个访客的嫌疑评估
 */
function analyzeFriendCheat(accountId, now = Date.now()) {
  const sampleData = readSampleData(accountId);
  const rawSamples = pruneSamples(sampleData.samples, now);
  const matureSet = new Set((sampleData.matureHistory || []).map((at) => Number(at)));
  let dogCache = {};
  try {
    dogCache = readFriendDogInfoCache(accountId) || {};
  } catch { }

  // 按访客分组；同时统计近 24 小时内「帮助/偷菜」操作覆盖的小时数（活跃度 X/24）
  const dayCutoffMs = now - 24 * 60 * 60 * 1000;
  const byVisitor = new Map();
  for (const [ts, gid, action, cropCount, nick] of rawSamples) {
    if (!byVisitor.has(gid)) {
      byVisitor.set(gid, { tsList: [], actions: [], cropCount: 0, nick: '', recentOpHours: new Set(), fastStealCount: 0 });
    }
    const entry = byVisitor.get(gid);
    const tsMs = Number(ts) * 1000;
    entry.tsList.push(tsMs);
    entry.actions.push(Number(action) || 0);
    entry.cropCount += Number(cropCount) || 0;
    if (nick) entry.nick = nick;
    // 近 24h 活跃度：只统计帮助(2)/偷菜(1)两类真实操作所在的小时桶
    if (tsMs >= dayCutoffMs && (action === 1 || action === 2)) {
      entry.recentOpHours.add(Math.floor(tsMs / 3600000));
    }
    // 秒偷：偷取时刻落在我方某地块成熟后 FAST_STEAL_WINDOW_SEC 内
    if (Number(action) === 1 && matureSet.size > 0) {
      const tsSec = Number(ts);
      for (let at = tsSec; at >= tsSec - FAST_STEAL_WINDOW_SEC; at -= 1) {
        if (matureSet.has(at)) {
          entry.fastStealCount += 1;
          break;
        }
      }
    }
  }

  const visitors = [];
  for (const [gid, entry] of byVisitor) {
    const tsList = [...entry.tsList].sort((a, b) => a - b);
    const total = tsList.length;
    const intervals = [];
    for (let i = 1; i < tsList.length; i++) {
      intervals.push((tsList[i] - tsList[i - 1]) / 1000);
    }

    // 凌晨活跃（0-6 点）
    const dawnCount = tsList.filter((ts) => {
      const hour = new Date(ts).getHours();
      return hour >= 0 && hour < 6;
    }).length;

    const spanMs = tsList.length >= 2 ? tsList[tsList.length - 1] - tsList[0] : 0;
    const firstDay = new Date(tsList[0]);
    firstDay.setHours(0, 0, 0, 0);
    const lastDay = new Date(tsList[tsList.length - 1]);
    lastDay.setHours(0, 0, 0, 0);
    const daySpanDays = Math.max(1, Math.round((lastDay - firstDay) / (24 * 60 * 60 * 1000)) + 1);

    const actionSet = new Set(entry.actions);
    const helpCount = entry.actions.filter((a) => a === 2).length;
    const stealCount = entry.actions.filter((a) => a === 1).length;
    const nuisanceCount = entry.actions.filter((a) => a === 3).length;

    const regularity = computeRegularityScore(intervals);
    const dawn = computeDawnScore(dawnCount, total);
    const perDay = Number((total / daySpanDays).toFixed(2));

    const isGuardDog = Number(dogCache[gid] && dogCache[gid].dogId) === GUARD_DOG_ID;

    let score =
      regularity.score +
      dawn.score +
      computeFrequencyScore(perDay) +
      computeSingleActionScore(actionSet, total) +
      computeActiveHoursScore(entry.recentOpHours.size) +
      computeFastStealScore(entry.fastStealCount, stealCount);

    // 护主犬保护：压缩嫌疑分，避免误伤
    if (isGuardDog) score = Math.min(score, 15);

    // 样本不足（< SAMPLE_MIN_TRUST 条）：嫌疑分按样本量线性压缩（小样本
    // 置信度低，如 10 条只保留一半分数），并封顶在关注线之下；同时不参与
    // 可疑（warn/danger）与高活跃标记，改由 insufficientSamples 标注
    const insufficientSamples = total < SAMPLE_MIN_TRUST;
    if (insufficientSamples) {
      score = Math.min(
        Math.round(score * (total / SAMPLE_MIN_TRUST)),
        INSUFFICIENT_SAMPLE_SCORE_CAP,
      );
    }
    score = Math.max(0, Math.min(100, Math.round(score)));

    const level = !insufficientSamples && score >= 60
      ? 'danger'
      : !insufficientSamples && score >= 30
        ? 'warn'
        : 'safe';

    visitors.push({
      gid,
      nick: entry.nick || `GID:${gid}`,
      score,
      // >=60 嫌疑（建议清洗）/ >=30 关注 / 其余正常；样本不足时一律 safe
      level,
      protected: isGuardDog,
      insufficientSamples,
      // 近 24 小时活跃度（覆盖的小时数 / 24）：普通玩家约 2-3 小时，
      // >= 4 小时开始怀疑、>= 10 小时基本挂机
      activeHours24: entry.recentOpHours.size,
      highActive: !insufficientSamples && entry.recentOpHours.size >= 6,
      metrics: {
        count: total,
        perDay,
        dawnRatio: dawn.ratio,
        regularityCv: regularity.cv,
        singleAction: actionSet.size === 1,
        spanHours: Number((spanMs / 3600000).toFixed(1)),
        helpCount,
        stealCount,
        stealValue: entry.cropCount,
        nuisanceCount,
        fastStealCount: entry.fastStealCount,
      },
      lastTs: tsList[tsList.length - 1] || 0,
    });
  }

  visitors.sort((a, b) => b.score - a.score || b.metrics.count - a.metrics.count);

  return {
    windowHours: SAMPLE_WINDOW_MS / (60 * 60 * 1000),
    sampleMinTrust: SAMPLE_MIN_TRUST,
    sampleCount: rawSamples.length,
    visitorCount: visitors.length,
    suspiciousCount: visitors.filter((v) => v.level === 'danger' && !v.protected).length,
    visitors,
  };
}

module.exports = {
  recordInteractSamples,
  analyzeFriendCheat,
  collectSamplesThrottled,
  SAMPLE_WINDOW_MS,
  SAMPLE_MIN_TRUST,
  GUARD_DOG_ID,
};
