/**
 * 好友外挂检测服务 - 基于访客互动记录的行为分析
 *
 * 原理：
 * - 挂机/查询过程中每次拉取访客互动记录时，把记录持续累积到本地样本库（72 小时滚动窗口）
 * - 对每个访客从五个维度评分，综合出 0-100 嫌疑分：
 *   1. 操作间隔规律性（真人操作间隔抖动大，脚本间隔高度均匀）
 *   2. 凌晨活跃占比（0-6 点高活跃是典型挂机特征）
 *   3. 日均频率（频率异常偏高）
 *   4. 行为单一性（只会一种动作，如只偷菜）
 *   5. 在线时长（窗口内活跃跨度异常长）
 * - 护主犬好友（dogId=90021）自动加分保护：嫌疑分强制压低并打上护主犬标记
 */
const fs = require('fs');
const path = require('path');
const { getDataFile } = require('../config/runtime-paths');
const { writeJsonFileAtomic } = require('./json-db');
const { readFriendDogInfoCache } = require('../models/store');
const { logWarn } = require('../utils/utils');

const SAMPLE_WINDOW_MS = 72 * 60 * 60 * 1000;
const SAMPLE_MAX_ENTRIES = 8000;

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

function readSamples(accountId) {
  try {
    const data = JSON.parse(fs.readFileSync(getSampleFile(accountId), 'utf8'));
    if (data && Array.isArray(data.samples)) return data.samples;
  } catch { }
  return [];
}

function writeSamples(accountId, samples) {
  try {
    writeJsonFileAtomic(getSampleFile(accountId), {
      samples: samples.slice(-SAMPLE_MAX_ENTRIES),
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
  const existing = readSamples(accountId);
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
    writeSamples(accountId, pruned);
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
  if (cv < 0.08) score = 25;
  else if (cv < 0.15) score = 18;
  else if (cv < 0.25) score = 10;
  else if (cv < 0.4) score = 4;
  return { score, cv: Number(cv.toFixed(3)) };
}

function computeDawnScore(dawnCount, total) {
  if (!total) return { score: 0, ratio: 0 };
  const ratio = dawnCount / total;
  let score = 0;
  if (ratio >= 0.3) score = 20;
  else if (ratio >= 0.15) score = 10;
  else if (ratio >= 0.08) score = 4;
  return { score, ratio: Number(ratio.toFixed(3)) };
}

function computeFrequencyScore(perDay) {
  let score = 0;
  if (perDay >= 40) score = 20;
  else if (perDay >= 20) score = 12;
  else if (perDay >= 10) score = 6;
  return score;
}

function computeSingleActionScore(actionTypes, total) {
  if (actionTypes.size === 1 && total >= 5) return 15;
  return 0;
}

function computeSpanScore(spanMs) {
  // 窗口内活跃跨度异常长（>=12h 明显、>=6h 可疑）
  if (spanMs >= 12 * 60 * 60 * 1000) return 10;
  if (spanMs >= 6 * 60 * 60 * 1000) return 5;
  return 0;
}

/**
 * 综合分析：返回每个访客的嫌疑评估
 */
function analyzeFriendCheat(accountId, now = Date.now()) {
  const rawSamples = pruneSamples(readSamples(accountId), now);
  let dogCache = {};
  try {
    dogCache = readFriendDogInfoCache(accountId) || {};
  } catch { }

  // 按访客分组
  const byVisitor = new Map();
  for (const [ts, gid, action, cropCount, nick] of rawSamples) {
    if (!byVisitor.has(gid)) {
      byVisitor.set(gid, { tsList: [], actions: [], cropCount: 0, nick: '' });
    }
    const entry = byVisitor.get(gid);
    entry.tsList.push(Number(ts) * 1000);
    entry.actions.push(Number(action) || 0);
    entry.cropCount += Number(cropCount) || 0;
    if (nick) entry.nick = nick;
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
      computeSpanScore(spanMs);

    // 护主犬保护：压缩嫌疑分，避免误伤
    if (isGuardDog) score = Math.min(score, 15);
    score = Math.max(0, Math.min(100, Math.round(score)));

    visitors.push({
      gid,
      nick: entry.nick || `GID:${gid}`,
      score,
      // >=60 嫌疑（建议清洗）/ >=30 关注 / 其余正常
      level: score >= 60 ? 'danger' : score >= 30 ? 'warn' : 'safe',
      protected: isGuardDog,
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
      },
      lastTs: tsList[tsList.length - 1] || 0,
    });
  }

  visitors.sort((a, b) => b.score - a.score || b.metrics.count - a.metrics.count);

  return {
    windowHours: SAMPLE_WINDOW_MS / (60 * 60 * 1000),
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
  GUARD_DOG_ID,
};
