/**
 * 邀请奖励系统
 *
 * 设计要点（防刷是第一目标）：
 * 1. 邀请码**永远可选**，注册不填照样成功——不做强制绑定。
 * 2. 被邀请人的奖励立即到账（体验优先）；邀请人的奖励先进「待定」，
 *    等被邀请人真的绑定了一个挂机账号才结算。批量注册小号既拿不到卡、
 *    也拿不到游戏账号，这条闸门直接把「空号刷邀请」的路堵死。
 * 3. 三层限流：同一个被邀请人只能被引一次、单个 IP 每天有上限、
 *    单个邀请人每天既有次数上限也有累计天数上限。
 * 4. 邀请人必须是「老号」（默认注册满 24 小时），避免 A 邀 B、B 再邀 C 的滚雪球。
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.FARM_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const STATE_FILE = process.env.QQFARM_INVITE_FILE || path.join(DATA_DIR, 'invites.json');

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_SETTINGS = {
  // 总开关：关掉后邀请码照常展示，但注册不发放任何奖励
  enabled: false,
  inviterDays: 3,
  inviteeDays: 3,
  // 单个邀请人每天最多邀请几个新号
  maxInvitesPerDay: 5,
  // 单个 IP 每天最多被计入几次邀请（防同一台机器批量注册）
  maxPerIpPerDay: 3,
  // 邀请人账号至少注册满多少小时才有资格拿奖励
  minInviterAgeHours: 24,
  // 邀请人每天最多靠邀请拿到多少天（防止奖励滚成无限时长）
  maxRewardDaysPerDay: 30,
  // 被邀请人必须绑定挂机账号，邀请人的奖励才结算
  requireBoundAccount: true,
  // 待定奖励保留多少天后作废
  pendingExpireDays: 7,
};

const HARD_LIMITS = {
  inviterDays: [0, 3650],
  inviteeDays: [0, 3650],
  maxInvitesPerDay: [0, 200],
  maxPerIpPerDay: [0, 200],
  minInviterAgeHours: [0, 24 * 365],
  maxRewardDaysPerDay: [0, 3650],
  pendingExpireDays: [1, 365],
};

function clampInt(value, [min, max], fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeSettings(raw = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  const out = { enabled: merged.enabled === true };
  for (const [key, range] of Object.entries(HARD_LIMITS)) {
    out[key] = clampInt(merged[key], range, DEFAULT_SETTINGS[key]);
  }
  out.requireBoundAccount = merged.requireBoundAccount !== false;
  return out;
}

function emptyState() {
  return { settings: { ...DEFAULT_SETTINGS }, codes: {}, records: [], identities: {}, seq: 0 };
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      settings: normalizeSettings(parsed.settings),
      codes: parsed.codes && typeof parsed.codes === 'object' ? parsed.codes : {},
      records: Array.isArray(parsed.records) ? parsed.records : [],
      identities: parsed.identities && typeof parsed.identities === 'object' ? parsed.identities : {},
      seq: Number(parsed.seq) || 0,
    };
  } catch {
    return emptyState();
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  return state;
}

function getSettings() {
  return loadState().settings;
}

function saveSettings(patch = {}) {
  const state = loadState();
  state.settings = normalizeSettings({ ...state.settings, ...(patch || {}) });
  saveState(state);
  return state.settings;
}

/** 邀请码：8 位大写字母数字，去掉容易看错的 0/O/1/I */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * 取（必要时创建）某用户的邀请码。
 * 老用户第一次打开邀请页也能立刻拿到码，不需要迁移脚本。
 */
function ensureCodeFor(username) {
  const name = String(username || '').trim();
  if (!name) return '';
  const state = loadState();
  const existing = Object.entries(state.codes).find(([, value]) => value?.username === name);
  if (existing) return existing[0];

  let code = randomCode();
  let guard = 0;
  while (state.codes[code] && guard < 50) {
    code = randomCode();
    guard += 1;
  }
  state.codes[code] = { username: name, createdAt: Date.now() };
  saveState(state);
  return code;
}

function findInviterByCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const state = loadState();
  const entry = state.codes[normalized];
  if (!entry) return null;
  return { code: normalized, username: entry.username, createdAt: Number(entry.createdAt) || 0 };
}

function startOfDay(timestamp = Date.now()) {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function recordsSince(state, since) {
  return state.records.filter(r => Number(r.at) >= since);
}

function countInvitesByInviter(state, inviter, since) {
  return recordsSince(state, since).filter(r => r.inviter === inviter && r.status !== 'rejected').length;
}

function sumRewardDaysByInviter(state, inviter, since) {
  return recordsSince(state, since)
    .filter(r => r.inviter === inviter && r.status === 'granted')
    .reduce((sum, r) => sum + (Number(r.inviterDays) || 0), 0);
}

function countInvitesByIp(state, ip, since) {
  if (!ip) return 0;
  return recordsSince(state, since).filter(r => r.ip === ip && r.status !== 'rejected').length;
}

/**
 * 注册前的资格检查。任何一条不通过都只影响「奖励」，不影响注册本身。
 * 返回 { ok, inviter, code, reason }
 */
function checkEligibility({ inviteCode, invitee, ip = '', userStore } = {}) {
  const settings = getSettings();
  const code = normalizeCode(inviteCode);
  if (!code) return { ok: false, reason: 'empty' };
  if (!settings.enabled) return { ok: false, reason: 'disabled', code };

  const inviter = findInviterByCode(code);
  if (!inviter) return { ok: false, reason: 'code_not_found', code };
  if (inviter.username === String(invitee || '')) return { ok: false, reason: 'self_invite', code, inviter };

  const state = loadState();

  // 同一个新账号只能被邀请一次（同名删号重注册也不再给）
  const usedByInvitee = state.records.some(r => r.invitee === invitee && r.status !== 'rejected');
  if (usedByInvitee) return { ok: false, reason: 'invitee_already_used', code, inviter };

  const inviterUser = userStore?.getUserByName ? userStore.getUserByName(inviter.username) : null;
  if (!inviterUser) return { ok: false, reason: 'inviter_missing', code, inviter };
  if (inviterUser.subscription && inviterUser.subscription.enabled === false) {
    return { ok: false, reason: 'inviter_disabled', code, inviter };
  }

  const inviterAgeMs = Date.now() - (Number(inviterUser.createdAt) || 0);
  if (inviterAgeMs < settings.minInviterAgeHours * 60 * 60 * 1000) {
    return { ok: false, reason: 'inviter_too_new', code, inviter };
  }

  const dayStart = startOfDay();
  if (settings.maxInvitesPerDay > 0
    && countInvitesByInviter(state, inviter.username, dayStart) >= settings.maxInvitesPerDay) {
    return { ok: false, reason: 'inviter_daily_limit', code, inviter };
  }
  if (settings.maxPerIpPerDay > 0
    && countInvitesByIp(state, ip, dayStart) >= settings.maxPerIpPerDay) {
    return { ok: false, reason: 'ip_daily_limit', code, inviter };
  }
  if (settings.maxRewardDaysPerDay > 0
    && sumRewardDaysByInviter(state, inviter.username, dayStart) + settings.inviterDays > settings.maxRewardDaysPerDay) {
    return { ok: false, reason: 'inviter_reward_cap', code, inviter };
  }

  return { ok: true, code, inviter, settings };
}

/**
 * 把一个挂机账号折算成「不会因重新登录而改变」的身份标识。
 * QQ 号用 uin（QQ 号本身），微信端用 openId/wxid —— 两者都是账号级常量。
 * 同一个标识只能被一个注册用户占用，用于挡住「注册一堆小号绑同一个游戏号刷时长」。
 */
function identityFromAccount(account = {}) {
  const platform = String(account.platform || '').trim().toLowerCase() || 'unknown';
  const raw = account.uin || account.qq || account.openId || account.open_id || account.wxid || '';
  const id = String(raw).trim().toLowerCase();
  if (!id) return '';
  return `${platform}:${id}`;
}

/**
 * 记录一条邀请流水（只保留最近 2000 条，避免文件无限膨胀）。
 */
function pushRecord(state, record) {
  state.seq = (Number(state.seq) || 0) + 1;
  const saved = { id: state.seq, at: Date.now(), ...record };
  state.records.push(saved);
  // 只保留最近 2000 条，避免文件无限增长
  if (state.records.length > 2000) {
    state.records = state.records.slice(-2000);
  }
  return saved;
}

/**
 * 注册成功后调用。返回给前端的提示信息。
 * @param {{inviteCode:string, invitee:string, ip?:string, userStore?:object}} input
 */
/**
 * 注册成功后的处理：写流水并按设置决定是立即发奖还是等绑定挂机账号。
 * @param {{inviteCode:string, invitee:string, ip?:string, userStore?:object}} input
 */
function handleRegistration({ inviteCode, invitee, ip = '', userStore } = {}) {
  const check = checkEligibility({ inviteCode, invitee, ip, userStore });
  const state = loadState();

  if (!check.ok) {
    if (String(inviteCode || '').trim()) {
      pushRecord(state, {
        inviter: check.inviter?.username || '',
        invitee,
        code: check.code || normalizeCode(inviteCode),
        ip,
        status: 'rejected',
        reason: check.reason,
        inviterDays: 0,
        inviteeDays: 0,
      });
      saveState(state);
    }
    return { ok: false, reason: check.reason, inviteeDays: 0, pending: false };
  }

  const { settings, inviter } = check;
  const inviteeDays = settings.inviteeDays;
  const inviterDays = settings.inviterDays;
  const pending = settings.requireBoundAccount === true;

  // 强制绑定模式：双方都先记成 pending，等这个新号真的绑上（并首次登录）一台挂机账号再发。
  // 这样「注册一堆小号立刻领天数」的路就被堵死了。
  if (pending) {
    pushRecord(state, {
      inviter: inviter.username,
      invitee,
      code: inviter.code,
      ip,
      status: 'pending',
      reason: 'waiting_bound_account',
      inviterDays: 0,
      inviteeDays: 0,
      pendingDays: inviterDays,
      pendingInviteeDays: inviteeDays,
    });
    saveState(state);
    return {
      ok: true,
      inviter: inviter.username,
      inviteeDays: 0,
      pending: true,
      pendingInviteeDays: inviteeDays,
      pendingInviterDays: inviterDays,
    };
  }

  let inviteeGrantedDays = 0;
  let grantError = '';
  if (inviteeDays > 0) {
    const grant = userStore?.extendSubscriptionByDays?.(invitee, inviteeDays, { reason: 'invite' });
    if (grant && grant.ok) inviteeGrantedDays = inviteeDays;
    else grantError = grant?.error || '';
  }
  let inviterGrantedDays = 0;
  if (inviterDays > 0) {
    const grant = userStore?.extendSubscriptionByDays?.(inviter.username, inviterDays, { reason: 'invite' });
    if (grant && grant.ok) inviterGrantedDays = inviterDays;
    else grantError = grantError || grant?.error || '';
  }

  pushRecord(state, {
    inviter: inviter.username,
    invitee,
    code: inviter.code,
    ip,
    status: 'granted',
    reason: '',
    inviterDays: inviterGrantedDays,
    inviteeDays: inviteeGrantedDays,
    grantError,
  });
  saveState(state);

  return {
    ok: true,
    inviter: inviter.username,
    inviteeDays: inviteeGrantedDays,
    pending: false,
    reason: grantError,
  };
}

function settleGrant(state, inviter, days) {
  const latest = [...state.records].reverse().find(r => r.inviter === inviter && r.status === 'granted' && r.inviterDays === 0);
  if (latest) {
    latest.inviterDays = days;
    saveState(state);
  }
}

/**
 * 被邀请人绑定了第一个挂机账号 → 结算邀请人的待定奖励。
 * 由账号创建路由调用，失败不影响建号。
 */
function markInviteeBound(invitee, userStore, identity = '') {
  const state = loadState();
  const settings = state.settings;
  const pendingRecords = state.records.filter(r => r.invitee === invitee && r.status === 'pending');
  if (pendingRecords.length === 0) return { ok: true, settled: 0 };

  const expired = pendingRecords.filter(r => Date.now() - Number(r.at) > settings.pendingExpireDays * DAY_MS);
  for (const record of expired) {
    record.status = 'expired';
    record.reason = 'pending_expired';
  }

  // 同一个挂机账号只能给一个注册用户带来奖励：占过就判 reused。
  const key = String(identity || '').trim().toLowerCase();
  if (key) {
    const owner = state.identities[key];
    if (owner && owner.username && owner.username !== invitee) {
      for (const record of pendingRecords) {
        if (record.status !== 'pending') continue;
        record.status = 'rejected';
        record.reason = 'identity_reused';
        record.identity = key;
        record.identityOwner = owner.username;
      }
      saveState(state);
      return { ok: false, reason: 'identity_reused', owner: owner.username, settled: 0 };
    }
    if (!owner) state.identities[key] = { username: invitee, at: Date.now() };
  }

  let settled = 0;
  for (const record of pendingRecords) {
    if (record.status !== 'pending') continue;
    const inviteeDays = Number(record.pendingInviteeDays) || 0;
    const inviterDays = Number(record.pendingDays) || 0;
    const inviteeGrant = inviteeDays > 0
      ? userStore?.extendSubscriptionByDays?.(record.invitee, inviteeDays, { reason: 'invite' })
      : { ok: true };
    const inviterGrant = inviterDays > 0
      ? userStore?.extendSubscriptionByDays?.(record.inviter, inviterDays, { reason: 'invite' })
      : { ok: true };
    if (inviteeGrant?.ok === false || inviterGrant?.ok === false) {
      record.grantError = inviteeGrant?.error || inviterGrant?.error || '';
      continue;
    }
    record.status = 'granted';
    record.reason = '';
    record.inviteeDays = inviteeDays;
    record.inviterDays = inviterDays;
    record.identity = key || '';
    record.settledAt = Date.now();
    settled += 1;
  }
  saveState(state);
  return { ok: true, settled, identity: key };
}

/** 用户侧：我的邀请码 + 战绩 */
function getUserSummary(username) {
  const settings = getSettings();
  const code = ensureCodeFor(username);
  const state = loadState();
  const mine = state.records.filter(r => r.inviter === username);
  const granted = mine.filter(r => r.status === 'granted');
  const pending = mine.filter(r => r.status === 'pending');
  const earnedDays = granted.reduce((sum, r) => sum + (Number(r.inviterDays) || 0), 0);
  return {
    enabled: settings.enabled,
    code,
    inviterDays: settings.inviterDays,
    inviteeDays: settings.inviteeDays,
    requireBoundAccount: settings.requireBoundAccount,
    invitedCount: granted.length + pending.length,
    grantedCount: granted.length,
    pendingCount: pending.length,
    earnedDays,
    records: mine
      .slice()
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
      .map(r => ({
        invitee: r.invitee,
        at: r.at,
        status: r.status,
        inviterDays: Number(r.inviterDays) || 0,
        pendingDays: Number(r.pendingDays) || 0,
      })),
  };
}

/** 管理后台：整体概览 */
function getAdminOverview({ limit = 100 } = {}) {
  const state = loadState();
  const records = state.records.slice().sort((a, b) => b.at - a.at);
  const granted = records.filter(r => r.status === 'granted');
  const rejected = records.filter(r => r.status === 'rejected');
  const pending = records.filter(r => r.status === 'pending');
  const byReason = {};
  for (const r of rejected) {
    byReason[r.reason || 'unknown'] = (byReason[r.reason || 'unknown'] || 0) + 1;
  }
  const topInviters = {};
  for (const r of granted) {
    topInviters[r.inviter] = (topInviters[r.inviter] || 0) + (Number(r.inviterDays) || 0);
  }
  return {
    settings: state.settings,
    stats: {
      total: records.length,
      granted: granted.length,
      pending: pending.length,
      rejected: rejected.length,
      grantedDays: granted.reduce((sum, r) => sum + (Number(r.inviterDays) || 0), 0),
      rejectedByReason: byReason,
      topInviters: Object.entries(topInviters)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([username, days]) => ({ username, days })),
    },
    records: records.slice(0, Math.max(1, Math.min(500, Number(limit) || 100))),
  };
}

module.exports = {
  DAY_MS,
  DEFAULT_SETTINGS,
  STATE_FILE,
  normalizeSettings,
  getSettings,
  saveSettings,
  ensureCodeFor,
  findInviterByCode,
  checkEligibility,
  handleRegistration,
  markInviteeBound,
  identityFromAccount,
  getUserSummary,
  getAdminOverview,
  normalizeCode,
};