/**
 * 邀请服务 - 处理邀请码（微信平台专用）
 *
 * 功能：
 * - 解析共享链接中的 UID/OpenID/share_key
 * - 通过 VisitService.Enter(share_key) 拿申请令牌 → FriendService.ApplyFriend 发送好友申请
 *   （抓包实证 2026-11-21：ReportArkClick 只是点击上报，不产生申请）
 * - 自动处理 share.txt 中的邀请码
 */
const { CONFIG } = require('../config/config');
const { getShareFilePath } = require('../config/runtime-paths');
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { toLong, log, logWarn, sleep } = require('../utils/utils');
const { readTextFile, writeTextFileAtomic } = require('./json-db');

// 每次申请间隔：2秒
const INVITE_REQUEST_DELAY = 2000;

// 从分享卡片进入对方农场的 reason（抓包实测值，配合 share_key 使用）
const ENTER_REASON_FROM_SHARE = 5;

// 等级缓存：同一 uid 在 TTL 内不重复进农场查询
const LEVEL_CACHE_TTL_MS = 30 * 60 * 1000;
const levelCache = new Map();

// 好友 gid 集合缓存：批量加好友前比对，已是好友直接跳过
const FRIEND_SET_TTL_MS = 60 * 1000;
let friendGidCache = { set: null, ts: 0 };

/**
 * 拉取当前账号的好友 gid 集合（60s 进程内缓存）
 *
 * 依据抓包（2026-11-20）：点开他人分享卡片时，客户端并不向服务端查询"是否好友"，
 * 而是直接用本地好友列表（FriendService.GetAll 回的 game_friends）判断，
 * 已是好友就不展示"添加好友"按钮、也不发 ApplyFriend。
 * 这里复用同一判据：分享卡片里的 uid 与好友列表里的 gid 是同一套 id。
 *
 * @param {boolean} [forceRefresh]
 * @returns {Promise<Set<string>>}
 */
async function loadFriendGidSet(forceRefresh = false) {
  if (!forceRefresh && friendGidCache.set && Date.now() - friendGidCache.ts < FRIEND_SET_TTL_MS) {
    return friendGidCache.set;
  }
  const { getAllFriends } = require('./friend-api');
  const reply = await getAllFriends(forceRefresh);
  const friends = Array.isArray(reply && reply.game_friends) ? reply.game_friends : [];
  const set = new Set(friends.map((f) => String(f.gid)));
  friendGidCache = { set, ts: Date.now() };
  return set;
}

/**
 * 从 URL 参数中解析分享信息
 */
function parseShareLink(raw) {
  const result = { uid: null, openid: null, shareSource: null, docId: null, shareKey: null };
  const params = raw.startsWith('?') ? raw.slice(1) : raw;
  const searchParams = new URLSearchParams(params);
  result.uid = searchParams.get('uid');
  result.openid = searchParams.get('openid');
  result.shareSource = searchParams.get('share_source');
  result.docId = searchParams.get('doc_id');
  result.shareKey = searchParams.get('share_key');
  return result;
}

/**
 * 读取 share.txt，去重后返回邀请码列表
 */
function readShareFile() {
  const filePath = getShareFilePath();
  try {
    const content = readTextFile(filePath, '');
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.includes('openid='));

    const results = [];
    const seenUids = new Set();
    for (const line of lines) {
      const parsed = parseShareLink(line);
      if (parsed.openid && parsed.uid && !seenUids.has(parsed.uid)) {
        seenUids.add(parsed.uid);
        results.push(parsed);
      }
    }
    return results;
  } catch (err) {
    logWarn('邀请', `读取 share.txt 失败: ${err.message}`);
    return [];
  }
}

/**
 * 向指定用户发送好友申请（通过 ReportArkClick）
 * scene_id 固定为 '1256'
 */
async function sendReportArkClick(uid, openId, shareSource) {
  const request = types.ReportArkClickRequest.encode(
    types.ReportArkClickRequest.create({
      sharer_id: toLong(uid),
      sharer_open_id: openId,
      share_cfg_id: toLong(shareSource || 0),
      scene_id: '1256',
    })
  ).finish();
  const { body } = await sendMsgAsync('gamepb.userpb.UserService', 'ReportArkClick', request);
  return types.ReportArkClickReply.decode(body);
}

/**
 * 进入对方农场（只读），返回基本信息 + 好友申请令牌
 *
 * 原理（抓包实证 2026-11-21, Reqable #334）：点开分享卡片时客户端调
 * `VisitService.Enter(host_gid=<卡片uid>, reason=5, share_key=<卡片share_key>)`，
 * 回包：
 * - `basic` 里带对方的 `level`（农场等级）、`name`、`gid`
 * - 顶层 `apply_token`（field 10）为好友申请令牌 "<64位hex>:<gid>"，
 *   点「添加好友」按钮时客户端原样发给 `FriendService.ApplyFriend`。
 *
 * 进入后立即 Leave，不碰对方的地块/作物。
 *
 * @param {string|number} uid 对方 gid（卡片 uid）
 * @param {string} shareKey 卡片里的 32 位 share_key（必填，否则服务端拒绝）
 * @returns {Promise<{level:number, name:string, gid:string, applyToken:string}>}
 */
async function enterSharer(uid, shareKey) {
  const request = types.VisitEnterRequest.encode(
    types.VisitEnterRequest.create({
      host_gid: toLong(uid),
      reason: ENTER_REASON_FROM_SHARE,
      share_key: String(shareKey || ''),
    })
  ).finish();
  const { body } = await sendMsgAsync('gamepb.visitpb.VisitService', 'Enter', request);
  const reply = types.VisitEnterReply.decode(body);
  const basic = reply.basic || {};
  const level = Number(basic.level || 0);
  const name = basic.name || '';
  const gid = String(basic.gid || uid);
  const applyToken = String(reply.apply_token || '');

  // 退出对方农场，避免会话停留在别人家里（失败不影响结果）
  try {
    const leave = types.VisitLeaveRequest.encode(
      types.VisitLeaveRequest.create({ host_gid: toLong(uid) })
    ).finish();
    await sendMsgAsync('gamepb.visitpb.VisitService', 'Leave', leave);
  } catch (_) {
    // ignore
  }

  return { level, name, gid, applyToken };
}

/**
 * 查询分享人基本信息（农场等级 / 昵称），30 分钟内缓存（不缓存申请令牌）
 */
async function fetchSharerLevel(uid, shareKey) {
  const key = String(uid);
  const cached = levelCache.get(key);
  if (cached && Date.now() - cached.ts < LEVEL_CACHE_TTL_MS) {
    return { level: cached.level, name: cached.name, gid: cached.gid };
  }

  const info = await enterSharer(uid, shareKey);
  levelCache.set(key, { level: info.level, name: info.name, gid: info.gid, ts: Date.now() });

  return { level: info.level, name: info.name, gid: info.gid };
}

/**
 * 发送好友申请（FriendService.ApplyFriend）
 *
 * 抓包实证：申请必须携带 `VisitService.Enter` 回包里的 apply_token，
 * 只发 ReportArkClick（点击上报）不会真正发送申请。
 *
 * @param {string|number} uid 对方 gid
 * @param {string} applyToken Enter 回包顶层 apply_token（"token:gid"）
 */
async function sendApplyFriend(uid, applyToken) {
  const request = types.ApplyFriendRequest.encode(
    types.ApplyFriendRequest.create({
      gid: toLong(uid),
      apply_token: String(applyToken || ''),
      source: 0,
    })
  ).finish();
  const { body } = await sendMsgAsync('gamepb.friendpb.FriendService', 'ApplyFriend', request);
  return types.ApplyFriendReply.decode(body || Buffer.alloc(0));
}

/**
 * 对单个分享人执行完整加好友流程（抓包实证 2026-11-21, Reqable #334）：
 *
 * 1. VisitService.Enter(reason=5, share_key) —— 拿对方等级 + 申请令牌（回包顶层 apply_token）
 * 2. ReportArkClick —— 模拟客户端点击链接的上报（失败不影响申请）
 * 3. FriendService.ApplyFriend(gid, apply_token, 0) —— 真正发送申请
 *
 * 注意：只发 ReportArkClick 不会添加好友；ApplyFriend 必须携带 Enter
 * 回包里的 apply_token，因此 share_key 是必需的。
 *
 * @param {{uid: string, openid: string, shareKey?: string, shareSource?: string|number}} item
 * @param {{minLevel?: number, allowUnknownLevel?: boolean}} opts
 * @returns {Promise<{uid:string, openid:string, ok:boolean, skipped?:boolean, level?:number|null, name?:string, error?:string}>}
 */
async function sendFriendRequestToSharer(item, opts = {}) {
  const { uid, openid, shareKey, shareSource } = item;
  const minLevel = Number(opts.minLevel) > 0 ? Math.floor(Number(opts.minLevel)) : 0;
  const allowUnknownLevel = opts.allowUnknownLevel === true;

  if (!shareKey) {
    // ApplyFriend 需要 Enter 回包的申请令牌，而 Enter 必须带 share_key
    return { uid, openid, ok: false, skipped: true, level: null, error: '缺少 share_key，无法获取好友申请令牌' };
  }

  // 等级快路径：缓存里已知等级低于阈值，直接跳过，省一次 Enter
  if (minLevel > 0 && !allowUnknownLevel) {
    const cached = levelCache.get(String(uid));
    if (cached && Date.now() - cached.ts < LEVEL_CACHE_TTL_MS && cached.level > 0 && cached.level < minLevel) {
      return { uid, openid, ok: false, skipped: true, level: cached.level, name: cached.name, error: `农场等级 ${cached.level} < ${minLevel}` };
    }
  }

  // 进对方农场：拿等级 + 申请令牌
  let info;
  try {
    info = await enterSharer(uid, shareKey);
  } catch (err) {
    levelCache.set(String(uid), { level: 0, name: '', gid: String(uid), ts: Date.now() });
    return {
      uid, openid, ok: false, skipped: minLevel > 0 && !allowUnknownLevel, level: null,
      error: minLevel > 0 && !allowUnknownLevel ? `等级查询失败：${err.message}` : `进入对方农场失败：${err.message}`,
    };
  }

  levelCache.set(String(uid), { level: info.level, name: info.name, gid: info.gid, ts: Date.now() });

  // 等级筛选
  if (minLevel > 0) {
    if (!info.level) {
      if (!allowUnknownLevel) {
        return { uid, openid, ok: false, skipped: true, level: 0, name: info.name, error: '未能读取农场等级' };
      }
    } else if (info.level < minLevel) {
      return { uid, openid, ok: false, skipped: true, level: info.level, name: info.name, error: `农场等级 ${info.level} < ${minLevel}` };
    }
  }

  // 模拟客户端行为：点击分享链接时的上报（遥测用，失败忽略）
  try {
    await sendReportArkClick(uid, openid, shareSource);
  } catch (_) {
    // ignore
  }

  // 真正发送申请
  try {
    if (!info.applyToken) {
      return { uid, openid, ok: false, level: info.level, name: info.name, error: 'Enter 回包未返回好友申请令牌' };
    }
    await sendApplyFriend(uid, info.applyToken);
    return { uid, openid, ok: true, level: info.level, name: info.name };
  } catch (err) {
    return { uid, openid, ok: false, level: info.level, name: info.name, error: err.message };
  }
}

/**
 * 批量发送好友申请（供前端「批量加好友」手动导入使用）
 *
 * 与 processInviteCodes 的区别：不读写 share.txt，逐条返回结果，
 * 便于前端展示每个 uid 的成功/失败原因。
 *
 * @param {Array<{uid: string|number, openid: string, shareSource?: string|number, shareKey?: string}>} items
 * @param {{delayMs?: number, minLevel?: number, allowUnknownLevel?: boolean, skipExistingFriends?: boolean}} [options]
 *        delayMs：每条之间的间隔，默认与自动流程一致（2s）
 *        minLevel：农场等级下限，>0 时先查对方等级，低于该值不发送申请（0/不传 = 不筛选）
 *        allowUnknownLevel：等级查不到（share_key 过期等）时是否仍然添加，默认 false
 *        skipExistingFriends：与已有好友列表比对，已是好友的直接跳过，默认 true
 * @returns {Promise<{total:number, success:number, failed:number, skipped:number, existing:number, results:Array}>}
 */
async function applyInviteList(items, options = {}) {
  if (CONFIG.platform !== 'wx') {
    throw new Error('当前账号不是微信环境，仅微信账号支持通过分享链接加好友');
  }

  const list = Array.isArray(items) ? items : [];
  const rawDelay = Number(options.delayMs);
  const delayMs = Number.isFinite(rawDelay) && rawDelay >= 0
    ? Math.min(rawDelay, 10000)
    : INVITE_REQUEST_DELAY;

  const rawMinLevel = Number(options.minLevel);
  const minLevel = Number.isFinite(rawMinLevel) && rawMinLevel > 0
    ? Math.floor(rawMinLevel)
    : 0;
  const allowUnknownLevel = options.allowUnknownLevel === true;
  const skipExistingFriends = options.skipExistingFriends !== false;

  // 先拉一次好友列表用于比对；拉取失败不影响主流程（退化为不跳过）
  let friendSet = null;
  if (skipExistingFriends && list.length > 0) {
    try {
      friendSet = await loadFriendGidSet();
      log('邀请', `已加载好友列表 ${friendSet.size} 人，用于跳过已是好友的分享链接`);
    } catch (err) {
      logWarn('邀请', `获取好友列表失败，本次不跳过已是好友: ${err.message}`);
    }
  }

  const results = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i] || {};
    const uid = String(item.uid == null ? '' : item.uid).trim();
    const openId = String(item.openid || item.openId || '').trim();
    const shareKey = String(item.shareKey || item.share_key || '').trim();

    if (!uid || !openId) {
      results.push({ uid, openid: openId, ok: false, error: '缺少 uid 或 openid' });
    } else if (friendSet && friendSet.has(uid)) {
      // 已是好友：不再发申请，也不浪费一次 Enter 查等级
      results.push({ uid, openid: openId, ok: false, skipped: true, existing: true, error: '已是好友，已跳过' });
    } else {
      // 完整流程交给 sendFriendRequestToSharer：
      // Enter（等级 + 申请令牌）→ 等级筛选 → ReportArkClick → ApplyFriend
      results.push(await sendFriendRequestToSharer({
        uid,
        openid: openId,
        shareKey,
        shareSource: item.shareSource != null ? item.shareSource : item.share_source,
      }, { minLevel, allowUnknownLevel }));
    }

    if (i < list.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const success = results.filter((item) => item.ok).length;
  const skipped = results.filter((item) => item.skipped).length;
  const existing = results.filter((item) => item.existing).length;
  return {
    total: results.length,
    success,
    failed: results.length - success - skipped,
    skipped,
    existing,
    minLevel,
    results,
  };
}

/**
 * 处理所有邀请码
 * - 仅微信平台支持
 * - 读取 share.txt → 逐个发送好友申请 → 清空 share.txt
 */
async function processInviteCodes() {
  if (CONFIG.platform !== 'wx') {
    log('邀请', '当前为 QQ 环境，跳过邀请码处理（仅微信支持）');
    return;
  }

  const codes = readShareFile();
  if (codes.length === 0) return;

  log('邀请', `读取到 ${codes.length} 个邀请码（已去重），开始逐个处理...`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const row = await sendFriendRequestToSharer({
      uid: String(code.uid),
      openid: String(code.openid || ''),
      shareKey: String(code.shareKey || ''),
      shareSource: code.shareSource,
    }, { minLevel: 0, allowUnknownLevel: true });
    if (row.ok) {
      success++;
      log('邀请', `[${i + 1}/${codes.length}] 已向 uid=${code.uid} 发送好友申请`);
    } else {
      failed++;
      logWarn('邀请', `[${i + 1}/${codes.length}] 向 uid=${code.uid} 发送申请失败: ${row.error}`);
    }

    // 最后一个不需要等待
    if (i < codes.length - 1) {
      await sleep(INVITE_REQUEST_DELAY);
    }
  }

  log('邀请', `处理完成: 成功 ${success}, 失败 ${failed}`);
  clearShareFile();
}

/**
 * 清空 share.txt 文件
 */
function clearShareFile() {
  const filePath = getShareFilePath();
  try {
    writeTextFileAtomic(filePath, '');
    log('邀请', '已清空 share.txt');
  } catch (_) {
    // 忽略清空失败
  }
}

module.exports = {
  parseShareLink,
  readShareFile,
  sendReportArkClick,
  sendApplyFriend,
  enterSharer,
  fetchSharerLevel,
  loadFriendGidSet,
  applyInviteList,
  processInviteCodes,
  clearShareFile,
};
