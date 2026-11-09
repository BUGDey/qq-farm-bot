'use strict';

/**
 * 外部顶号（「已在其他终端登录」）记录器。
 *
 * 只放内存状态，不落盘：重启面板后历史清零，这没问题——重新登录本来就会重新判一次。
 * 被顶号不是网络问题，反复自动重登只会互相顶，所以这里给「短时间多次被顶」和
 * 「刚被顶过」两种判断，分别拦住自动重登与定时刷新 Code。
 */

const WINDOW_MS = 30 * 60 * 1000;
const LIMIT = 3;
const RECENT_MS = 15 * 60 * 1000;

/** accountId -> 被顶时间戳数组 */
const history = new Map();

function isExternalLoginKick(reason) {
  const text = String(reason || '');
  return /其他终端|其他设备|另一台|已在别处|other\s*(terminal|device)/i.test(text);
}

/** 记一次被顶；返回该账号窗口内累计被顶次数 */
function markKick(accountId, at = Date.now()) {
  const key = String(accountId || '');
  if (!key) return 0;
  const list = (history.get(key) || []).filter(time => at - time < WINDOW_MS);
  list.push(at);
  history.set(key, list);
  return list.length;
}

/**
 * 是否应该放弃自动重登：外部顶号且短时间内已达上限。
 * 非外部顶号（网络断、服务器踢人）一律返回 false，交给原有重登逻辑。
 */
function shouldStopAutoRelogin(accountId, reason) {
  if (!isExternalLoginKick(reason)) return false;
  return markKick(accountId) > LIMIT;
}

/** 最近是否被外部顶过（定时刷新 Code 前用来避让） */
function isRecentlyKicked(accountId, withinMs = RECENT_MS) {
  const key = String(accountId || '');
  if (!key) return false;
  const list = history.get(key);
  if (!list || !list.length) return false;
  const latest = Math.max(...list);
  return Date.now() - latest < withinMs;
}

function recentCount(accountId) {
  const key = String(accountId || '');
  const list = history.get(key);
  if (!list) return 0;
  const now = Date.now();
  return list.filter(time => now - time < WINDOW_MS).length;
}

function reset(accountId) {
  if (accountId === undefined) {
    history.clear();
    return;
  }
  history.delete(String(accountId));
}

module.exports = {
  WINDOW_MS,
  LIMIT,
  RECENT_MS,
  isExternalLoginKick,
  markKick,
  shouldStopAutoRelogin,
  isRecentlyKicked,
  recentCount,
  reset,
};