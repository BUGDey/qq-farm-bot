/**
 * 好友号池：空闲时自动补读等级/犬种（少量多次、多账号分摊）。
 *
 * 设计要点（用户 2026-11-23 需求）：
 * - 不再按「每天多少条」限额，改成按账号：一个账号跑完一轮（把缺的资料补齐）后
 *   进入 24 小时冷却，冷却结束才能再用这个账号开新一轮；
 * - 每批只读 ITEMS_PER_BATCH 条，读完歇一会儿再读下一批，避免影响账号巡查/自动任务；
 * - 有自动任务在跑、或者马上要跑，就先等空闲（worker 内 waitForAutomationQuiet），
 *   等不到就放弃这一轮、留给下一次 tick；
 * - 多个账号轮着用：优先挑最久没用的可用账号，它不可用再换下一个。
 */
const friendPool = require('./friend-pool');
const { createModuleLogger } = require('./logger');

const log = createModuleLogger('friend-pool-autoread');

/** 每批只读几条：少量，worker 里每条之间还有 500ms 间隔 */
const ITEMS_PER_BATCH = 2;
/** 一个账号跑完一轮后的冷却时间：24 小时 */
const ACCOUNT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** 两次 tick 之间至少隔 2 分钟，避免频繁触发 */
const MIN_TICK_GAP_MS = 2 * 60 * 1000;
/** 每批之间的休息时间：15~30 秒随机 */
const BATCH_GAP_MIN_MS = 15 * 1000;
const BATCH_GAP_MAX_MS = 30 * 1000;
/** 单条读取之间的间隔（传给 worker） */
const PER_ITEM_DELAY_MS = 500;
/** 一个账号不可用时最多换几个账号试 */
const MAX_ACCOUNT_TRIES = 3;

/**
 * 运行态：主进程里正在跑的自动补读（页面轮询展示「正在读取 / 最近结果」）。
 * 持久化的部分在号池的 autoRead 里（跨重启保留），这里只放内存态的当前进度。
 */
const runtime = {
  running: false,
  startedAt: 0,
  finishedAt: 0,
  read: 0,
  batches: 0,
  accounts: [],
  lastError: '',
};

function resetRuntime() {
  runtime.running = false;
  runtime.startedAt = 0;
  runtime.read = 0;
  runtime.batches = 0;
  runtime.accounts = [];
  runtime.lastError = '';
}

function dayKey(now = Date.now()) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sleep(ms, deps) {
  if (typeof deps.sleep === 'function') return deps.sleep(ms);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomGap() {
  return BATCH_GAP_MIN_MS + Math.floor(Math.random() * (BATCH_GAP_MAX_MS - BATCH_GAP_MIN_MS + 1));
}

/** 账号上次读取时间 → 冷却结束时间 */
function accountCooldown(state, accountId, nowMs = Date.now()) {
  const perAccount = (state && state.accounts && typeof state.accounts === 'object') ? state.accounts : {};
  const info = perAccount[String(accountId)] || {};
  const lastRunAt = Number(info.lastRunAt) || 0;
  const nextEligibleAt = lastRunAt > 0 ? lastRunAt + ACCOUNT_COOLDOWN_MS : 0;
  return { lastRunAt, nextEligibleAt, cooling: nextEligibleAt > nowMs };
}

/**
 * 尝试执行一轮自动补读；不满足条件时直接返回 skipped。
 * @param {{
 *   accounts?: Array<{id:any,name?:string,platform?:string}>,
 *   callWorkerApi?: Function,
 *   sleep?: (ms:number)=>Promise<void>,
 *   now?: ()=>number
 * }} deps
 */
async function maybeRunDailyAutoRead(deps = {}) {
  const { accounts, callWorkerApi, now = () => Date.now() } = deps;
  if (typeof callWorkerApi !== 'function') return { skipped: true, reason: '没有可用的 worker 调用入口' };

  const state = friendPool.getAutoReadState() || {};
  if (state.lastRunAt && now() - Number(state.lastRunAt) < MIN_TICK_GAP_MS) {
    return { skipped: true, reason: '距上一条读取不足 2 分钟' };
  }

  const items = friendPool.getItemsMissingProfile(5000);
  if (items.length === 0) return { skipped: true, reason: '号池资料已齐全' };

  const wxAccounts = (Array.isArray(accounts) ? accounts : [])
    .filter((account) => account && (account.platform === 'wx' || account.platform === 'wechat' || !account.platform));
  if (wxAccounts.length === 0) return { skipped: true, reason: '没有微信账号' };

  const nowMs = now();
  const candidates = shuffle(wxAccounts)
    .map((account) => ({ account, ...accountCooldown(state, account.id, nowMs) }))
    .filter((entry) => !entry.cooling)
    .sort((a, b) => a.lastRunAt - b.lastRunAt);
  if (candidates.length === 0) {
    const nextEligibleAt = Math.min(...wxAccounts.map((account) => accountCooldown(state, account.id, nowMs).nextEligibleAt));
    return {
      skipped: true,
      reason: '所有微信账号都在 24 小时冷却中',
      nextEligibleAt,
    };
  }

  let read = 0;
  let batches = 0;
  let cursor = 0;
  const usedAccounts = [];
  const accountOrder = candidates.map((entry) => entry.account).slice(0, MAX_ACCOUNT_TRIES);

  runtime.running = true;
  runtime.startedAt = now();
  runtime.finishedAt = 0;
  runtime.read = 0;
  runtime.batches = 0;
  runtime.accounts = [];
  runtime.lastError = '';

  try {
    while (cursor < items.length) {
      const chunk = items.slice(cursor, cursor + ITEMS_PER_BATCH);
      const payload = chunk.map((item) => ({
        uid: item.uid,
        openid: item.openid,
        shareKey: item.shareKey,
        shareSource: item.shareSource,
      }));

      // 这一批在可用账号里轮着找；都不可用就放弃本轮，等下一次 tick
      let result = null;
      let usedAccountId = '';
      let lastError = '';
      const rotate = batches % accountOrder.length;
      for (let attempt = 0; attempt < accountOrder.length; attempt += 1) {
        const account = accountOrder[(rotate + attempt) % accountOrder.length];
        const accountId = String(account.id);
        try {
          result = await callWorkerApi(accountId, 'fetchSharerLevels', payload, {
            delayMs: PER_ITEM_DELAY_MS,
            autoRead: true,
          }, { _timeoutMs: 180000 });
          usedAccountId = accountId;
          break;
        } catch (error) {
          lastError = String(error && error.message ? error.message : error);
          runtime.lastError = lastError;
          // 账号没在跑/被别的任务占着：换下一个账号试这批
          if (!/账号未运行|automation_busy|正在执行|繁忙|busy/i.test(lastError)) throw error;
          log.info(`账号 ${accountId} 暂不可用（${lastError}），换下一个账号`, {
            module: 'friend', event: '自动读等级跳过账号',
          });
        }
      }
      if (!result) {
        return {
          skipped: true,
          reason: `账号都不可用：${lastError}`,
          nextEligibleAt: now() + MIN_TICK_GAP_MS,
        };
      }

      const ok = Number(result.ok) || 0;
      const failed = Number(result.failed) || 0;
      read += chunk.length;
      batches += 1;
      cursor += chunk.length;
      if (!usedAccounts.includes(usedAccountId)) usedAccounts.push(usedAccountId);
      runtime.read = read;
      runtime.batches = batches;
      runtime.accounts = usedAccounts.slice();

      friendPool.markAutoReadRun({
        lastAccountId: usedAccountId,
        itemsRead: chunk.length,
        batches: 1,
        lastResult: { total: result.total, ok, failed },
        now: now(),
      });
      log.info(`已读 ${chunk.length} 条（成功 ${ok}，失败 ${failed}），账号 ${usedAccountId}`, {
        module: 'friend', event: '自动读等级批次', result: ok > 0 ? 'ok' : 'failed',
      });

      if (cursor >= items.length) break;
      await sleep(randomGap(), deps);
    }
  } finally {
    runtime.running = false;
    runtime.finishedAt = Date.now();
  }

  let missing = 0;
  try {
    missing = friendPool.getItemsMissingProfile(5000).length;
  } catch (_) {
    missing = 0;
  }
  return { ok: true, read, batches, accounts: usedAccounts, remaining: missing };
}

/**
 * 自动补读状态（给页面展示）：内存里的当前进度 + 每个账号的 24 小时冷却。
 */
function getAutoReadStatus(nowMs = Date.now()) {
  const state = friendPool.getAutoReadState() || {};
  let missing = 0;
  try {
    missing = friendPool.getItemsMissingProfile(5000).length;
  } catch (_) {
    missing = 0;
  }
  const perAccount = (state.accounts && typeof state.accounts === 'object') ? state.accounts : {};
  const accounts = Object.keys(perAccount).map((accountId) => {
    const info = perAccount[accountId] || {};
    const lastRunAt = Number(info.lastRunAt) || 0;
    const nextEligibleAt = lastRunAt > 0 ? lastRunAt + ACCOUNT_COOLDOWN_MS : 0;
    return {
      accountId,
      lastRunAt,
      nextEligibleAt,
      remainingMs: Math.max(0, nextEligibleAt - nowMs),
    };
  }).sort((a, b) => a.nextEligibleAt - b.nextEligibleAt);
  const cooling = accounts.filter((entry) => entry.remainingMs > 0);
  return {
    running: runtime.running,
    startedAt: runtime.startedAt,
    finishedAt: runtime.finishedAt,
    currentRead: runtime.read,
    currentBatches: runtime.batches,
    currentAccounts: runtime.accounts.slice(),
    lastError: runtime.lastError,
    lastRunAt: Number(state.lastRunAt) || 0,
    lastAccountId: state.lastAccountId || '',
    lastResult: state.lastResult || null,
    missing,
    accounts,
    nextEligibleAt: cooling.length > 0 ? Math.min(...cooling.map((entry) => entry.nextEligibleAt)) : 0,
    cooldownMs: ACCOUNT_COOLDOWN_MS,
    minTickGapMs: MIN_TICK_GAP_MS,
  };
}

module.exports = {
  maybeRunDailyAutoRead,
  dayKey,
  getAutoReadStatus,
  ITEMS_PER_BATCH,
  ACCOUNT_COOLDOWN_MS,
  MAX_ACCOUNT_TRIES,
};