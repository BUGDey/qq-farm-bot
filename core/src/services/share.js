/**
 * 分享服务 - 每日自动完成分享并领取奖励
 *
 * 功能：
 * - 检查是否可以分享
 * - 上报分享状态
 * - 领取分享奖励
 */
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log, toNum } = require('../utils/utils');
const { getItemById } = require('../config/gameConfig');
const { getDataFile } = require('../config/runtime-paths');
const { readJsonFile, writeJsonFileAtomic } = require('./json-db');

const DAILY_KEY = 'daily_share';

// 每日首次分享奖励：罐头(1小时) id=80021，抓包确认 delta=5。
// 成功判定：CheckCanShare=true → ClaimShareReward(errorCode=0) → ItemNotify(80021, delta=5)。
// ClaimShareRewardReply.success 受 wire2 嵌套影响不可靠，不作为判据。
const CAN_ITEM_ID = 80021;
const CAN_EXPECTED_DELTA = 5;
const CLAIM_STATE_FILE = () => getDataFile('share-claim-daily.json');

// 两次检查最小间隔：10分钟
const CHECK_COOLDOWN_MS = 10 * 60 * 1000;

// 每日状态追踪
let doneDateKey = '';
let claimDoneDateKey = null; // null = 尚未从持久化文件加载
let lastCheckAt = 0;
let lastClaimAt = 0;

// ---- 日期工具 ----

function getDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function markDoneToday() {
  doneDateKey = getDateKey();
}

function isDoneToday() {
  return doneDateKey === getDateKey();
}

// ---- 奖励摘要 ----
// 1001→金币, 1002→经验, 500→点券

function getRewardSummary(items) {
  const list = Array.isArray(items) ? items : [];
  const parts = [];
  for (const item of list) {
    const id = toNum(item.id);
    const count = toNum(item.count);
    if (count <= 0) continue;
    if (id === 1001 || id === 500001) {
      parts.push(`金币${count}`);
    } else if (id === 1002 || id === 500002) {
      parts.push(`经验${count}`);
    } else if (id === 500) {
      parts.push(`点券${count}`);
    } else {
      const info = getItemById(id);
      const name = info && info.name ? String(info.name) : `物品#${id}`;
      parts.push(`${name}x${count}`);
    }
  }
  return parts.join('/');
}

/**
 * 判断是否"已领取"错误
 */
function isAlreadyClaimedError(err) {
  const msg = String(err && err.message || '');
  return msg.includes('code=1009001') || msg.includes('已经领取');
}

// ---- RPC 调用 ----

async function checkCanShare() {
  const request = types.CheckCanShareRequest.encode(
    types.CheckCanShareRequest.create({})
  ).finish();
  const { body } = await sendMsgAsync('gamepb.sharepb.ShareService', 'CheckCanShare', request);
  return types.CheckCanShareReply.decode(body);
}

async function reportShare() {
  const request = types.ReportShareRequest.encode(
    types.ReportShareRequest.create({ shared: true })
  ).finish();
  const { body } = await sendMsgAsync('gamepb.sharepb.ShareService', 'ReportShare', request);
  return types.ReportShareReply.decode(body);
}

async function claimShareReward() {
  const request = types.ClaimShareRewardRequest.encode(
    types.ClaimShareRewardRequest.create({ claimed: true })
  ).finish();
  const { body } = await sendMsgAsync('gamepb.sharepb.ShareService', 'ClaimShareReward', request);
  return types.ClaimShareRewardReply.decode(body);
}

// ---- 每日首次分享领奖：仅领取，绝不伪造分享动作 ----

// 抓包确认：领取成功后服务端推送 ItemNotify(item.id=80021, delta=5)。
// network.js 把 ItemNotify 交给 handleNotify 解码，但不对 80021 做任何处理，也没有透出事件；
// 由于禁止改动 network.js，这里在共享的 types.ItemNotify.decode 上挂一个轻量观测钩子，
// 把符合条件的通知记入带时间戳的缓冲，作为「到账确认」依据。
const canNotifyTimestamps = [];
const MAX_CAN_NOTIFY_RECORDS = 50;

function installCanNotifyObserver() {
  const type = types && types.ItemNotify;
  if (!type || type.__canClaimObserved) return;
  // protobuf.js 的 decode 是懒初始化的：首次调用 setup() 会用实例方法覆盖原型上的
  // decode_setup。必须先 setup() 再打补丁，否则观察钩子会被 lazy setup 覆盖掉。
  if (typeof type.setup === 'function') type.setup();
  const originalDecode = type.decode;
  if (typeof originalDecode !== 'function') return;
  function observedDecode(buffer, ...rest) {
    const decoded = originalDecode.call(this, buffer, ...rest);
    try {
      const items = (decoded && decoded.items) || [];
      for (const itemChg of items) {
        if (!itemChg || !itemChg.item) continue;
        const id = toNum(itemChg.item.id);
        const delta = toNum(itemChg.delta);
        if (id === CAN_ITEM_ID && delta >= CAN_EXPECTED_DELTA) {
          canNotifyTimestamps.push(Date.now());
          if (canNotifyTimestamps.length > MAX_CAN_NOTIFY_RECORDS) {
            canNotifyTimestamps.splice(0, canNotifyTimestamps.length - MAX_CAN_NOTIFY_RECORDS);
          }
          break;
        }
      }
    } catch { /* 观测失败不影响原解码逻辑 */ }
    return decoded;
  }
  observedDecode.__canClaimObserved = true;
  type.decode = observedDecode;
}

function hasCanNotifySince(ts) {
  return canNotifyTimestamps.some(at => at >= ts);
}

function getClaimAccountKey() {
  return String(process.env.FARM_ACCOUNT_ID || 'default')
    .trim().replace(/[^\w-]/g, '_') || 'default';
}

function loadClaimDoneDate() {
  if (claimDoneDateKey !== null) return claimDoneDateKey;
  try {
    const state = readJsonFile(CLAIM_STATE_FILE(), () => ({}));
    claimDoneDateKey = String((state && state[getClaimAccountKey()]) || '');
  } catch {
    claimDoneDateKey = '';
  }
  return claimDoneDateKey;
}

function markClaimDoneToday() {
  const key = getDateKey();
  claimDoneDateKey = key;
  try {
    const loaded = readJsonFile(CLAIM_STATE_FILE(), () => ({}));
    const state = (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) ? loaded : {};
    state[getClaimAccountKey()] = key;
    writeJsonFileAtomic(CLAIM_STATE_FILE(), state, 2);
  } catch (err) {
    log('分享', `领取状态持久化失败: ${err && err.message || err}`, {
      module: 'task', event: DAILY_KEY, result: 'error'
    });
  }
}

/**
 * 每日首次分享领奖：只做「检查可领 → 领取」，绝不伪造分享动作。
 *
 * - 不调用 ReportShare / ReportArkClick 等任何伪造上报。
 * - 不依赖 ClaimShareRewardReply.success（wire2 嵌套导致不可靠）。
 * - 成功判据：CheckCanShare=true → ClaimShareReward(errorCode=0) →
 *   近期 ItemNotify(80021, delta>=5) 到账确认。
 * - 1009001 /「已经领取」视为今日完成并持久化。
 * - 超时 / 回包不明：不重试、不标记，下次例行任务重查 CheckCanShare。
 *
 * @param {object} [automation=null] 可选的自动化配置；显式为 false 时不执行（worker 侧已 gate，此处为防御性检查）。
 * @returns {Promise<boolean>} 是否确认领取到账
 */
async function claimDailyShareRewardIfAvailable(automation = null) {
  if (automation && automation.share_claim_daily === false) return false;
  if (loadClaimDoneDate() === getDateKey()) return false;

  installCanNotifyObserver();

  let canShareResult;
  try {
    canShareResult = await checkCanShare();
  } catch (err) {
    log('分享', `每日分享领奖-检查失败: ${err && err.message || err}`, {
      module: 'task', event: DAILY_KEY, result: 'error'
    });
    return false;
  }
  if (!canShareResult || !canShareResult.can_share) {
    log('分享', '每日分享领奖-当前无可领取分享', {
      module: 'task', event: DAILY_KEY, result: 'none'
    });
    return false;
  }

  // sendMsgAsync 在 errorCode!==0 时抛错，因此此处 resolved 即代表 errorCode=0
  const notifySince = Date.now();
  try {
    await claimShareReward();
  } catch (err) {
    if (isAlreadyClaimedError(err)) {
      markClaimDoneToday();
      log('分享', '每日分享领奖-今日已领取', {
        module: 'task', event: DAILY_KEY, result: 'none'
      });
      return false;
    }
    log('分享', `每日分享领奖-领取失败: ${err && err.message || err}`, {
      module: 'task', event: DAILY_KEY, result: 'error'
    });
    return false;
  }

  // 回包不明（无到账通知）：不重试、不标记，下次重查状态
  if (!hasCanNotifySince(notifySince)) {
    log('分享', '每日分享领奖-未收到到账通知，稍后重查', {
      module: 'task', event: DAILY_KEY, result: 'unknown'
    });
    return false;
  }

  markClaimDoneToday();
  log('分享', `每日分享领奖成功 → 罐头x${CAN_EXPECTED_DELTA}`, {
    module: 'task', event: DAILY_KEY, result: 'ok'
  });
  return true;
}

// ---- 主逻辑 ----

/**
 * 执行每日分享任务
 * @param {boolean} force - 强制检查
 */
async function performDailyShare(force = false) {
  const now = Date.now();

  if (!force && isDoneToday()) return false;
  if (!force && now - lastCheckAt < CHECK_COOLDOWN_MS) return false;

  lastCheckAt = now;

  try {
    // 检查是否可以分享
    const canShareResult = await checkCanShare();
    if (!canShareResult || !canShareResult.can_share) {
      log('分享', '今日暂无可领取分享礼包', { module: 'task', event: DAILY_KEY, result: 'none' });
      return false;
    }

    // 上报分享
    const reportResult = await reportShare();
    if (!reportResult || !reportResult.success) {
      log('分享', '上报分享状态失败', { module: 'task', event: DAILY_KEY, result: 'error' });
      return false;
    }

    // 领取奖励
    let claimResult = null;
    try {
      claimResult = await claimShareReward();
    } catch (err) {
      if (isAlreadyClaimedError(err)) {
        markDoneToday();
        log('分享', '今日分享奖励已领取', { module: 'task', event: DAILY_KEY, result: 'none' });
        return false;
      }
      throw err;
    }

    if (!claimResult || !claimResult.success) {
      log('分享', '领取分享礼包失败', { module: 'task', event: DAILY_KEY, result: 'error' });
      return false;
    }

    const items = Array.isArray(claimResult.items) ? claimResult.items : [];
    const summary = getRewardSummary(items);

    log('分享',
      summary ? `领取成功 → ${summary}` : '领取成功',
      { module: 'task', event: DAILY_KEY, result: 'ok', count: items.length }
    );

    lastClaimAt = Date.now();
    markDoneToday();
    return true;
  } catch (err) {
    log('分享', `领取失败: ${err.message}`, { module: 'task', event: DAILY_KEY, result: 'error' });
    return false;
  }
}

module.exports = {
  performDailyShare,
  claimDailyShareRewardIfAvailable,
  getShareDailyState: () => ({
    key: DAILY_KEY,
    doneToday: isDoneToday(),
    claimDoneToday: loadClaimDoneDate() === getDateKey(),
    lastCheckAt,
    lastClaimAt,
  }),
};
