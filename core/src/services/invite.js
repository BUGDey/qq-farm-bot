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
const friendPool = require('./friend-pool');

// 每次申请间隔：2秒
const INVITE_REQUEST_DELAY = 2000;

// 从分享卡片进入对方农场的 reason（抓包实测值，配合 share_key 使用）
const ENTER_REASON_FROM_SHARE = 5;

// 等级缓存：同一 uid 在 TTL 内不重复进农场查询
const LEVEL_CACHE_TTL_MS = 30 * 60 * 1000;
const levelCache = new Map();

// 每日好友申请上限的错误特征（抓包实证：code=1005027 今日发出的好友申请已达上限）
const DAILY_LIMIT_PATTERN = /1005027|好友申请已达上限|申请已达上限|达到上限|已达上限/;

function isDailyLimitError(message) {
  return DAILY_LIMIT_PATTERN.test(String(message || ''));
}

// 未开启「好友功能 · 点击分享链接可拜访好友」的错误特征
// 抓包实证 2026-11-22：该开关关闭时 Enter(reason=5, share_key) 直接返回
// code=1002007 未打开拜访好友开关，且不会返回 apply_token，因此无法加好友。
// 这是账号级设置，不是单条链接的问题，碰到就该整批停下让用户去打开开关。
const VISIT_SWITCH_PATTERN = /1002007|未打开拜访好友开关|拜访好友开关/;

function isVisitSwitchError(message) {
  return VISIT_SWITCH_PATTERN.test(String(message || ''));
}

const VISIT_SWITCH_HINT = '未开启「好友功能 · 点击分享链接可拜访好友」：请到游戏 设置 → 好友功能 里打开该开关后再试';

// 开关状态缓存：前端按 10 条一批提交，不缓存的话每批都要多读一次设置
const VISIT_SWITCH_TTL_MS = 5 * 60 * 1000;
let visitSwitchCache = { value: null, ts: 0 };

/**
 * 读取当前账号的「点击分享链接可拜访好友」开关状态
 *
 * 抓包实证：GetUserSettings 回包顶层 field 1 是设置结构，内层 field 6 = 1 为开启。
 *
 * @param {boolean} [forceRefresh]
 * @returns {Promise<boolean|null>} true=开启 false=关闭 null=读不到（不影响主流程）
 */
async function readVisitSwitchEnabled(forceRefresh = false) {
  if (!forceRefresh && visitSwitchCache.value !== null && Date.now() - visitSwitchCache.ts < VISIT_SWITCH_TTL_MS) {
    return visitSwitchCache.value;
  }
  try {
    if (!types.GetUserSettingsRequest || !types.GetUserSettingsReply) return null;
    const body = types.GetUserSettingsRequest.encode(types.GetUserSettingsRequest.create({})).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.userpb.UserService', 'GetUserSettings', body);
    const reply = types.GetUserSettingsReply.decode(replyBody || Buffer.alloc(0));
    const settings = (reply && reply.settings) || {};
    const enabled = Number(settings.visit_by_share_key || 0) === 1;
    visitSwitchCache = { value: enabled, ts: Date.now() };
    return enabled;
  } catch (err) {
    logWarn('邀请', `读取好友拜访开关失败（不影响本次申请）: ${err.message}`);
    return null;
  }
}

/**
 * 自动打开「好友功能 · 点击分享链接可拜访好友」
 *
 * 抓包实证（2026-11-22）：在游戏设置里打开该开关时客户端发的就是
 * SetUserSettings{ field 6 = 1 }，回包为空。写完再读一次确认。
 *
 * @returns {Promise<boolean>} 是否已确认开启
 */
async function enableVisitSwitch() {
  visitSwitchCache = { value: null, ts: 0 };
  try {
    if (!types.SetUserSettingsRequest) return false;
    const body = types.SetUserSettingsRequest.encode(
      types.SetUserSettingsRequest.create({ visit_by_share_key: 1 })
    ).finish();
    await sendMsgAsync('gamepb.userpb.UserService', 'SetUserSettings', body);
  } catch (err) {
    logWarn('邀请', `自动打开拜访好友开关失败: ${err.message}`);
    return false;
  }
  const confirmed = await readVisitSwitchEnabled(true);
  return confirmed === true;
}

/**
 * 确保拜访好友开关是开着的：没开就自动打开
 * @returns {Promise<boolean|null>} true=已开启 false=尝试后仍未开启 null=读不到状态
 */
async function ensureVisitSwitch() {
  const state = await readVisitSwitchEnabled();
  if (state !== false) return state;
  log('邀请', '检测到「点击分享链接可拜访好友」未开启，自动打开...');
  const opened = await enableVisitSwitch();
  if (opened) log('邀请', '已自动开启拜访好友开关，继续加好友');
  return opened;
}

/** 当前 worker 所属账号 id（号池按账号隔离） */
function currentAccountId() {
  return String(process.env.FARM_ACCOUNT_ID || '') || 'default';
}

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
/**
 * 批量读取分享人等级 / 昵称并写回号池（不发送好友申请）。
 *
 * 只做 Enter → Leave，不改任何账号的申请状态；供管理后台按等级筛选后再精确添加。
 *
 * @param {Array<{uid:string, shareKey?:string, share_key?:string}>} items
 * @param {{delayMs?:number}} [options]
 * @returns {Promise<{total:number, ok:number, failed:number, results:Array}>}
 */
async function fetchLevelsForItems(items, options = {}) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  const rawDelay = Number(options.delayMs);
  const delayMs = Number.isFinite(rawDelay) && rawDelay >= 0
    ? Math.min(rawDelay, 5000)
    : 300;
  const results = [];

  // 先确保己方「点击分享链接可拜访好友」是开的（有 10 分钟缓存，失败忽略）：
  // 这样后面再撞 1002007，就能确定是对方关闭了拜访，而不是我们自己的开关没开。
  if (list.length > 0) {
    try {
      await ensureVisitSwitch();
    } catch (_) {
      // 打不开也不影响读取，Enter 会给出真实错误
    }
  }

  for (let i = 0; i < list.length; i++) {
    const item = list[i] || {};
    const uid = String(item.uid || '').trim();
    const shareKey = String(item.shareKey || item.share_key || '').trim();
    if (!uid) {
      results.push({ uid, ok: false, error: '缺少 uid' });
      continue;
    }
    if (!shareKey) {
      results.push({ uid, ok: false, error: '缺少 share_key，无法进入对方农场读取等级' });
      continue;
    }
    try {
      const info = await fetchSharerLevel(uid, shareKey);
      const readAt = Date.now();
      const dogKnown = Boolean(info.dogBreed) || info.dogAbsent === true;
      friendPool.updateItemProfile(uid, {
        name: info.name,
        level: info.level,
        dogBreed: info.dogBreed,
        dogAbsent: info.dogAbsent === true,
        levelFetchedAt: readAt,
        dogFetchedAt: dogKnown ? readAt : undefined,
      });
      // Enter 成功说明现在能进对方农场：之前记的「拜访关闭」已经过时了
      if (typeof friendPool.markVisitOpen === 'function') {
        try {
          friendPool.markVisitOpen(uid);
        } catch (_) {
          // 状态清理失败不影响读取结果
        }
      }
      results.push({ uid, ok: true, level: info.level, name: info.name, dogBreed: info.dogBreed });
    } catch (error) {
      const message = (error && error.message) || '读取等级失败';
      // 1002007 不需要加好友就能确认：Enter 被拒就是对方关闭了拜访。
      // 命中时写回号池，面板上直接显示「拜访关闭」，不必先尝试申请一次。
      if (isVisitSwitchError(message)) {
        try {
          friendPool.markVisitClosed(uid, message);
        } catch (_) {
          // 号池写入失败不影响本条结果
        }
        results.push({
          uid,
          ok: false,
          visitClosed: true,
          error: '拜访关闭（1002007）：对方未开放拜访',
        });
        logWarn('邀请', `读取等级发现对方拜访关闭 uid=${uid}: ${message}`);
      } else {
        results.push({ uid, ok: false, error: message });
        logWarn('邀请', `读取等级失败 uid=${uid}: ${message}`);
      }
    }
    if (delayMs > 0 && i < list.length - 1) await sleep(delayMs);
  }
  return {
    total: list.length,
    ok: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    visitClosed: results.filter(r => r.visitClosed).length,
    results,
  };
}

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
  const dog = readDogBreed(reply);

  // 退出对方农场，避免会话停留在别人家里（失败不影响结果）
  try {
    const leave = types.VisitLeaveRequest.encode(
      types.VisitLeaveRequest.create({ host_gid: toLong(uid) })
    ).finish();
    await sendMsgAsync('gamepb.visitpb.VisitService', 'Leave', leave);
  } catch (_) {
    // ignore
  }

  return { level, name, gid, applyToken, dogBreed: dog.dogBreed, dogAbsent: dog.dogAbsent };
}

/**
 * 从 VisitEnterReply 里解析对方农场的护主犬品种。
 *
 * `brief_dog_info`（field 3）是服务端下发的犬只摘要，里面有一个 varint 是犬 id
 * （90001 田园犬 / 90002 牧羊犬 / 90003 斑点狗 / 90011 柯基 / 90021 护主犬）。
 * 解析失败或没有狗时返回空串（界面显示为『无狗』由号池统计决定）。
 */
function readDogBreed(reply) {
  try {
    const raw = reply && reply.brief_dog_info;
    // 回包里没有犬只摘要 = 确认对方农场没有狗；有摘要但解析不出品种 = 未知（不是无狗）
    if (!raw || !raw.length) return { dogBreed: '', dogAbsent: true };
    const { parseBriefDogInfoBytes, getDogName } = require('./friend-api');
    const parsed = parseBriefDogInfoBytes(Buffer.from(raw));
    return { dogBreed: getDogName(parsed.dogId) || '', dogAbsent: false };
  } catch (_) {
    // 解析失败说明不了有没有狗，按未知处理
    return { dogBreed: '', dogAbsent: false };
  }
}

/**
 * 查询分享人基本信息（农场等级 / 昵称），30 分钟内缓存（不缓存申请令牌）
 */
async function fetchSharerLevel(uid, shareKey) {
  const key = String(uid);
  const cached = levelCache.get(key);
  if (cached && Date.now() - cached.ts < LEVEL_CACHE_TTL_MS) {
    return {
      level: cached.level, name: cached.name, gid: cached.gid,
      dogBreed: cached.dogBreed || '', dogAbsent: cached.dogAbsent === true,
    };
  }

  const info = await enterSharer(uid, shareKey);
  levelCache.set(key, {
    level: info.level,
    name: info.name,
    gid: info.gid,
    dogBreed: info.dogBreed || '',
    dogAbsent: info.dogAbsent === true,
    ts: Date.now(),
  });

  return {
    level: info.level, name: info.name, gid: info.gid,
    dogBreed: info.dogBreed || '', dogAbsent: info.dogAbsent === true,
  };
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
    // 1002007：本批开始前已经自动打开过己方「点击分享链接可拜访好友」开关，
    // 这里再撞到说明是对方没有开放拜访（卡片信息能读到，但进不去、加不了）。
    // 记到号池里单独统计，并继续处理下一条，不要因此停掉整批。
    if (isVisitSwitchError(err.message)) {
      try {
        friendPool.markVisitClosed(uid, err.message);
      } catch (_) {
        // 号池写入失败不影响本条结果
      }
      return {
        uid, openid, ok: false, skipped: false, visitClosed: true, level: null,
        error: '拜访关闭（1002007）：对方未开放拜访，无法添加好友',
      };
    }
    levelCache.set(String(uid), { level: 0, name: '', gid: String(uid), ts: Date.now() });
    return {
      uid, openid, ok: false, skipped: minLevel > 0 && !allowUnknownLevel, level: null,
      error: minLevel > 0 && !allowUnknownLevel ? `等级查询失败：${err.message}` : `进入对方农场失败：${err.message}`,
    };
  }

  levelCache.set(String(uid), { level: info.level, name: info.name, gid: info.gid, ts: Date.now() });

  // 顺便回填号池：进农场这一步已经把昵称 / 等级 / 犬种读到了，
  // 「自动识别」就是把这些现成的资料写回共享条目，不再额外读一遍。
  try {
    if (typeof friendPool.updateItemProfile === 'function') {
      const readAt = Date.now();
      const dogKnown = Boolean(info.dogBreed) || info.dogAbsent === true;
      friendPool.updateItemProfile(uid, {
        name: info.name,
        level: info.level,
        dogBreed: info.dogBreed,
        dogAbsent: info.dogAbsent === true,
        levelFetchedAt: readAt,
        dogFetchedAt: dogKnown ? readAt : undefined,
      });
    }
  } catch (_) {
    // 号池写入失败不影响这次申请
  }

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
  // 等级上限与犬种筛选：面板上的「筛选配置」传进来，命中不了的条目不消耗每日次数
  const rawMaxLevel = Number(options.maxLevel);
  const maxLevel = Number.isFinite(rawMaxLevel) && rawMaxLevel > 0
    ? Math.floor(rawMaxLevel)
    : 0;
  const dogBreeds = Array.isArray(options.dogBreeds)
    ? [...new Set(options.dogBreeds.map(b => String(b || '').trim()).filter(Boolean))]
    : [];
  const accountId = currentAccountId();

  // 按筛选条件加人时需要读到条目的等级/犬种，一次性取号池快照（避免循环里反复读文件）
  let profileMap = null;
  if (minLevel > 0 || maxLevel > 0 || dogBreeds.length > 0) {
    try {
      profileMap = new Map(
        friendPool.getPoolSnapshot(accountId).entries.map(entry => [String(entry.uid), entry])
      );
    } catch (err) {
      logWarn('邀请', `读取号池资料失败（本次不做等级上限/犬种筛选）: ${err.message}`);
    }
  }

  // 本次导入的链接先合并进号池（链接库全账号共享，同 uid 只留一条，卡片以最新为准）
  try {
    const merged = friendPool.upsertInviteItems(list);
    if (merged.added || merged.updated) {
      log('邀请', `号池已收录 ${list.length} 条链接（新增 ${merged.added}，合并 ${merged.updated}）`);
    }
  } catch (err) {
    logWarn('邀请', `号池写入失败（不影响本次申请）: ${err.message}`);
  }

  // 今天已经撞过上限：本账号当天再发起只会继续被拒（还会白跑一次 Enter），直接整批跳过。
  // 链接仍会先并入号池（上面已做），明天点「开始添加」就能继续用。
  const todayLimit = (() => {
    try {
      return friendPool.getDailyLimitState(accountId);
    } catch (_) {
      return { blocked: false, dateKey: '', at: null, error: '' };
    }
  })();
  if (todayLimit.blocked) {
    logWarn('邀请', `本账号今日好友申请已达上限（${todayLimit.dateKey} 已记录），本批 ${list.length} 条直接跳过，不再发起请求`);
    const blockedRows = list.map((item) => {
      const uid = String((item && item.uid) == null ? '' : item.uid).trim();
      const openId = String((item && (item.openid || item.openId)) || '').trim();
      return {
        uid,
        openid: openId,
        ok: false,
        skipped: true,
        limitReached: true,
        error: '今日申请已达上限（当天已记录），明天再试',
      };
    });
    return {
      total: blockedRows.length,
      success: 0,
      failed: 0,
      skipped: blockedRows.length,
      existing: 0,
      poolSkipped: 0,
      limitReached: true,
      switchBlocked: false,
      minLevel,
      results: blockedRows,
    };
  }

  // 先拉一次好友列表用于比对；拉取失败不影响主流程（退化为不跳过）  let friendSet = null;
  if (skipExistingFriends && list.length > 0) {
    try {
      friendSet = await loadFriendGidSet();
      log('邀请', `已加载好友列表 ${friendSet.size} 人，用于跳过已是好友的分享链接`);
      // 回填号池：已经通过的好友要标成 friend，否则号池会把他们当「24h 未通过」误判成不可加
      try {
        const fixed = friendPool.markFriends(accountId, Array.from(friendSet));
        if (fixed > 0) log('邀请', `号池回填：${fixed} 条链接已是好友`);
      } catch (_) {
        // 号池回填失败不影响本次申请
      }
    } catch (err) {
      logWarn('邀请', `获取好友列表失败，本次不跳过已是好友: ${err.message}`);
    }
  }

  // 一次性读出该账号所有条目的状态：逐条 peekStatus 会反复读号池文件，
  // 号池上千条时非常慢（用户 2026-11-22 反馈）
  let poolStatusMap = null;
  try {
    poolStatusMap = friendPool.getStatusMap(accountId);
  } catch (err) {
    logWarn('邀请', `读取号池状态失败（退化为逐条查询）: ${err.message}`);
  }

  const results = [];
  let limitReached = false;
  let switchBlocked = false;

  // 账号级开关预检：没开「点击分享链接可拜访好友」时 Enter 必定 1002007。
  // 先自动打开（抓包实证 SetUserSettings field6=1），能打开就直接继续加好友。
  const switchReady = await ensureVisitSwitch();
  if (switchReady === false) {
    logWarn('邀请', VISIT_SWITCH_HINT);
    const blocked = list.map((item) => {
      const uid = String((item && item.uid) == null ? '' : item.uid).trim();
      const openId = String((item && (item.openid || item.openId)) || '').trim();
      return { uid, openid: openId, ok: false, skipped: false, switchBlocked: true, error: VISIT_SWITCH_HINT };
    });
    return {
      total: blocked.length,
      success: 0,
      failed: blocked.length,
      skipped: 0,
      existing: 0,
      poolSkipped: 0,
      limitReached: false,
      switchBlocked: true,
      minLevel,
      results: blocked,
    };
  }

  // 本条目是否真的发起了网络请求：只有发过请求才需要按间隔限速，
  // 已是好友 / 已申请等待中 / 不可加 的跳过不该占用等待时间
  let attempted = false;
  for (let i = 0; i < list.length; i++) {
    attempted = false;
    const item = list[i] || {};
    const uid = String(item.uid == null ? '' : item.uid).trim();
    const openId = String(item.openid || item.openId || '').trim();
    const shareKey = String(item.shareKey || item.share_key || '').trim();

    if (limitReached || switchBlocked) {
      // 已达每日申请上限 / 开关没开：剩余条目原样跳过，不做任何网络请求
      results.push({
        uid, openid: openId, ok: false, skipped: true,
        ...(limitReached
          ? { limitReached: true, error: '今日申请已达上限，本批已停止' }
          : { switchBlocked: true, error: '拜访好友开关未开启，本批已停止' }),
      });
      continue;
    }

    // 等级上限 / 犬种筛选：用号池里「读取等级」得到的资料判断，没读过的按未识别处理
    let filterSkip = null;
    if (profileMap) {
      const profile = profileMap.get(uid);
      const level = Number(profile && profile.level) || 0;
      const breed = profile
        ? (profile.dogBreed || (profile.dogAbsent ? friendPool.NO_DOG : friendPool.UNKNOWN_BREED))
        : '';
      if (level === 0 && !allowUnknownLevel) {
        filterSkip = '还没读取到等级，取消勾选「等级查不到也加」后不会参与添加';
      } else if (level > 0 && level < minLevel) {
        filterSkip = `农场等级 ${level} < 下限 ${minLevel}，已按筛选跳过`;
      } else if (maxLevel > 0 && level > 0 && level > maxLevel) {
        filterSkip = `农场等级 ${level} > 上限 ${maxLevel}，已按筛选跳过`;
      } else if (dogBreeds.length > 0 && !dogBreeds.includes(breed)) {
        filterSkip = `犬种不符合筛选（${breed || '未识别'}），已跳过`;
      }
    }

    if (!uid || !openId) {
      results.push({ uid, openid: openId, ok: false, error: '缺少 uid 或 openid' });
    } else if (friendSet && friendSet.has(uid)) {
      // 已是好友：不再发申请，也不浪费一次 Enter 查等级
      // （好友列表在循环前已用 markFriends 批量回填号池，这里不必逐条落盘）
      results.push({ uid, openid: openId, ok: false, skipped: true, existing: true, error: '已是好友，已跳过' });
    } else {
      const poolStatus = poolStatusMap
        ? poolStatusMap.get(uid)
        : friendPool.peekStatus(accountId, uid);
      if (poolStatus === 'friend') {
        // 号池已记录为好友（本次好友列表没拉到也能跳过）
        results.push({ uid, openid: openId, ok: false, skipped: true, existing: true, error: '已是好友，已跳过' });
      } else if (poolStatus === 'dead') {
        // 之前申请过、超过 24 小时仍未通过：不再浪费每日次数
        results.push({
          uid, openid: openId, ok: false, skipped: true, poolSkipped: true,
          error: '号池标记不可加：上次申请超过 24 小时未通过',
        });
      } else if (poolStatus === 'pending') {
        // 24 小时内已申请过，等待通过即可，不重复发
        results.push({
          uid, openid: openId, ok: false, skipped: true, poolSkipped: true,
          error: '已申请，等待通过中（24 小时内不重复申请）',
        });
      } else if (filterSkip) {
        // 等级上限 / 犬种筛选不命中：不进入对方农场，也不消耗每日次数
        results.push({ uid, openid: openId, ok: false, skipped: true, filteredOut: true, error: filterSkip });
      } else {
        // 完整流程交给 sendFriendRequestToSharer：
        // Enter（等级 + 申请令牌）→ 等级筛选 → ReportArkClick → ApplyFriend
        attempted = true;
        const requestItem = {
          uid,
          openid: openId,
          shareKey,
          shareSource: item.shareSource != null ? item.shareSource : item.share_source,
        };
        let row = await sendFriendRequestToSharer(requestItem, { minLevel, allowUnknownLevel });

        // 开关被关掉了（1002007）：自动打开后立刻重试本条，用户不必手动去设置里点
        // 但如果是「拜访关闭」条目（对方不让拜访），重试没有意义，直接跳过
        if (!row.ok && !row.visitClosed && (row.switchBlocked || isVisitSwitchError(row.error))) {
          const reopened = await enableVisitSwitch();
          if (reopened) {
            log('邀请', '已自动打开「点击分享链接可拜访好友」，重试本条');
            row = await sendFriendRequestToSharer(requestItem, { minLevel, allowUnknownLevel });
          }
        }

        if (row.ok) {
          try {
            friendPool.markApplied(accountId, uid, {
              openid: openId, shareKey, name: row.name, level: row.level,
            });
          } catch (_) {
            // 号池写入失败不影响申请结果
          }
          // 同一批里若重复出现同一 uid，后续按「已申请」跳过
          if (poolStatusMap) poolStatusMap.set(uid, 'pending');
        } else if (isDailyLimitError(row.error)) {
          limitReached = true;
          row.limitReached = true;
          // 记到号池：今天后续批次（重新点按钮、定时任务）直接跳过，不再白跑请求
          try {
            friendPool.markDailyLimit(accountId, row.error);
          } catch (_) {
            // 号池写入失败不影响「本批已停止」这个结论
          }
          logWarn('邀请', `今日好友申请已达上限，本批停止（已处理 ${i + 1}/${list.length}）: ${row.error}`);
        } else if (!row.visitClosed && (row.switchBlocked || isVisitSwitchError(row.error))) {
          // 开关是账号级的：出现一次就整批停下，避免后面每一条都白跑一遍
          switchBlocked = true;
          row.switchBlocked = true;
          logWarn('邀请', `${VISIT_SWITCH_HINT}（已处理 ${i + 1}/${list.length}）`);
        }
        results.push(row);
      }
    }

    // 只有真的发起了申请才按间隔限速；跳过（已是好友 / 已申请 / 不可加）立即处理下一个
    if (attempted && delayMs > 0 && i < list.length - 1) {
      await sleep(delayMs);
    }
  }

  const success = results.filter((item) => item.ok).length;
  const skipped = results.filter((item) => item.skipped).length;
  const existing = results.filter((item) => item.existing).length;
  const poolSkipped = results.filter((item) => item.poolSkipped).length;
  const visitClosed = results.filter((item) => item.visitClosed).length;
  return {
    total: results.length,
    success,
    failed: results.length - success - skipped,
    skipped,
    existing,
    poolSkipped,
    visitClosed,
    limitReached,
    switchBlocked,
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

  const accountId = currentAccountId();
  try {
    friendPool.upsertInviteItems(codes);
  } catch (_) {
    // 号池写入失败不影响主流程
  }

  // 今天已撞过上限：保留 share.txt 原样等明天，不要清空（否则这些链接就丢了）
  let todayLimitBlocked = false;
  try {
    todayLimitBlocked = friendPool.getDailyLimitState(accountId).blocked;
  } catch (_) {
    // 读不到就按未上限处理，正常继续
  }
  if (todayLimitBlocked) {
    logWarn('邀请', `本账号今日好友申请已达上限，保留 share.txt 中 ${codes.length} 个邀请码待明天处理`);
    return;
  }

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let friendSet = null;
  try {
    friendSet = await loadFriendGidSet();
    // 回填号池：已是好友的条目置为 friend，避免被当成「超 24h 未通过」
    if (friendSet && friendSet.size > 0) {
      try {
        friendPool.markFriends(accountId, Array.from(friendSet));
      } catch (_) {
        // ignore
      }
    }
  } catch (_) {
    // 拉不到好友列表就退化为不跳过
  }

  let poolStatusMap = null;
  try {
    poolStatusMap = friendPool.getStatusMap(accountId);
  } catch (_) {
    poolStatusMap = null;
  }

  // 账号级开关预检：没开就自动打开，避免每条 Enter 都撞 1002007
  await ensureVisitSwitch();

  // 中途停止（上限/开关）时从这里记录位置，剩下的邀请码写回 share.txt 留到下次
  let stoppedAt = -1;

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const uid = String(code.uid || '');

    // 已是好友 / 号池判定：不再浪费每日申请次数
    if (friendSet && friendSet.has(uid)) {
      skipped++;
      log('邀请', `[${i + 1}/${codes.length}] uid=${uid} 已是好友，跳过`);
      continue;
    }
    const poolStatus = poolStatusMap
      ? poolStatusMap.get(uid)
      : friendPool.peekStatus(accountId, uid);
    if (poolStatus === 'dead') {
      skipped++;
      log('邀请', `[${i + 1}/${codes.length}] uid=${uid} 号池标记不可加（超 24h 未通过），跳过`);
      continue;
    }
    if (poolStatus === 'pending') {
      skipped++;
      log('邀请', `[${i + 1}/${codes.length}] uid=${uid} 已申请等待通过，跳过`);
      continue;
    }

    const requestItem = {
      uid,
      openid: String(code.openid || ''),
      shareKey: String(code.shareKey || ''),
      shareSource: code.shareSource,
    };
    let row = await sendFriendRequestToSharer(requestItem, { minLevel: 0, allowUnknownLevel: true });

    // 开关没开：自动打开后重试一次
    if (!row.ok && (row.switchBlocked || isVisitSwitchError(row.error))) {
      const reopened = await enableVisitSwitch();
      if (reopened) {
        log('邀请', '已自动打开「点击分享链接可拜访好友」，重试本条');
        row = await sendFriendRequestToSharer(requestItem, { minLevel: 0, allowUnknownLevel: true });
      }
    }

    if (row.ok) {
      success++;
      try {
        friendPool.markApplied(accountId, uid, { openid: String(code.openid || ''), shareKey: String(code.shareKey || '') });
      } catch (_) {
        // ignore
      }
      log('邀请', `[${i + 1}/${codes.length}] 已向 uid=${code.uid} 发送好友申请`);
    } else if (isDailyLimitError(row.error)) {
      failed++;
      // 记到号池：今天剩下的定时任务/批次都直接跳过，不再逐条试
      try {
        friendPool.markDailyLimit(accountId, row.error);
      } catch (_) {
        // ignore
      }
      logWarn('邀请', `今日好友申请已达上限，停止自动流程（已处理 ${i + 1}/${codes.length}）: ${row.error}`);
      stoppedAt = i + 1;
      break;
    } else if (row.switchBlocked || isVisitSwitchError(row.error)) {
      // 自动打开也失败：整批停下，避免剩下的每条都白跑
      failed++;
      logWarn('邀请', `${VISIT_SWITCH_HINT}（已处理 ${i + 1}/${codes.length}）`);
      stoppedAt = i + 1;
      break;
    } else {
      failed++;
      logWarn('邀请', `[${i + 1}/${codes.length}] 向 uid=${code.uid} 发送申请失败: ${row.error}`);
    }

    // 最后一个不需要等待
    if (i < codes.length - 1) {
      await sleep(INVITE_REQUEST_DELAY);
    }
  }

  log('邀请', `处理完成: 成功 ${success}, 失败 ${failed}, 跳过 ${skipped}`);
  if (stoppedAt >= 0) {
    // 中途停下：已处理的部分不再保留，剩下的写回 share.txt 等下次继续
    writeRemainingShareCodes(codes.slice(stoppedAt));
  } else {
    clearShareFile();
  }
}

/**
 * 把解析后的邀请码还原成 share.txt 的行格式
 */
function formatShareCode(code) {
  const params = new URLSearchParams();
  params.set('uid', String((code && code.uid) || ''));
  if (code && code.openid) params.set('openid', String(code.openid));
  if (code && code.shareSource != null && code.shareSource !== '') params.set('share_source', String(code.shareSource));
  if (code && code.docId != null && code.docId !== '') params.set('doc_id', String(code.docId));
  if (code && code.shareKey) params.set('share_key', String(code.shareKey));
  return `?${params.toString()}`;
}

/**
 * 把还没处理的邀请码写回 share.txt
 * 中途停下（今日上限/开关未开）时必须走这里，不能直接清空文件，否则这些链接就丢了
 */
function writeRemainingShareCodes(codes) {
  const filePath = getShareFilePath();
  const text = (Array.isArray(codes) ? codes : [])
    .map(formatShareCode)
    .filter((line) => line.includes('openid='))
    .join('\n');
  try {
    writeTextFileAtomic(filePath, text ? `${text}\n` : '');
    if (text) log('邀请', `share.txt 已保留 ${codes.length} 个未处理邀请码，下次继续`);
  } catch (err) {
    logWarn('邀请', `写回 share.txt 失败: ${err.message}`);
  }
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
  fetchLevelsForItems,
  applyInviteList,
  processInviteCodes,
  clearShareFile,
  readVisitSwitchEnabled,
  enableVisitSwitch,
  ensureVisitSwitch,
};
