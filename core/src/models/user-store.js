/**
 * 多用户账号与卡密体系 —— 数据层
 *
 * 数据文件（均落在 data/ 目录，可通过 FARM_DATA_DIR 重定向）：
 *   users.json            用户表
 *   cards.json            卡密表
 *   card-redemptions.json 卡密核销流水
 *   login-attempts.json   登录失败计数（限流/锁定）
 *   login-logs.json       登录审计日志
 *
 * 设计要点：
 *   1. 密码使用 PBKDF2-SHA512(salt, 100000 iter, 64B) 存储，永不明文落盘。
 *   2. 用户有效期 = subscription.expiresAt（时间戳）；null 表示永久。
 *      isPermanent=true 的永久卡优先级高于一切加时。
 *   3. 卡密一经核销即写入 usedBy/usedAt 并生成核销流水，不可重复使用。
 *   4. 所有写操作先 load 再改内存最后整体 save，保证单进程一致性。
 */
const crypto = require('node:crypto');
const { getDataFile, ensureDataDir } = require('../config/runtime-paths');
const { readJsonFile, writeJsonFileAtomic } = require('../services/json-db');
const {
  USER_SYSTEM_CONFIG,
  USER_ROLES,
  CARD_TYPES,
  CARD_STATUS,
  isElevatedRole,
} = require('../config/user-system');

const { MINUTE_MS, HOUR_MS, DAY_MS } = USER_SYSTEM_CONFIG;

// ==================== 数据文件路径 ====================

const USERS_FILE = getDataFile('users.json');
const CARDS_FILE = getDataFile('cards.json');
const REDEMPTIONS_FILE = getDataFile('card-redemptions.json');
const LOGIN_ATTEMPTS_FILE = getDataFile('login-attempts.json');
const LOGIN_LOGS_FILE = getDataFile('login-logs.json');

// ==================== 常量 ====================

const DEFAULT_ACCOUNT_LIMIT = USER_SYSTEM_CONFIG.defaultAccountLimit;
const ADMIN_ACCOUNT_LIMIT = USER_SYSTEM_CONFIG.adminAccountLimit;
const UNLIMITED = -1;

const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 64;
const PBKDF2_DIGEST = 'sha512';

/** 卡密字母表：剔除易混淆的 0/O/1/I */
const CARD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const USERNAME_RE = /^\w{3,32}$/;
const WEAK_PASSWORDS = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123',
  '111111', '000000', 'admin', 'admin123', 'iloveyou',
]);

// ==================== 小工具 ====================

function now() {
  return Date.now();
}

function toInt(value, fallback = 0) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}

function toPositiveInt(value, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

function createId(prefix = '') {
  return `${prefix}${now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

// ==================== 密码 ====================

function hashPassword(password, salt = null) {
  const useSalt = salt || crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto
    .pbkdf2Sync(String(password), useSalt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST)
    .toString('hex');
  return `${useSalt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const text = String(stored);
  if (text.includes(':')) {
    const [salt, hash] = text.split(':');
    const computed = crypto
      .pbkdf2Sync(String(password), salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST)
      .toString('hex');
    return computed === hash;
  }
  // 兼容早期 sha256 明文哈希，登录成功后会自动升级
  return crypto.createHash('sha256').update(String(password)).digest('hex') === text;
}

function needsRehash(stored) {
  return !String(stored || '').includes(':');
}

function validatePasswordStrength(password) {
  const errors = [];
  const text = String(password || '');
  if (text.length < 6) errors.push('密码长度至少 6 位');
  if (text.length > 128) errors.push('密码长度不能超过 128 位');
  if (/\s/.test(text)) errors.push('密码不能包含空格');

  let complexity = 0;
  if (/[a-z]/.test(text)) complexity += 1;
  if (/[A-Z]/.test(text)) complexity += 1;
  if (/\d/.test(text)) complexity += 1;
  if (/[^A-Z0-9]/i.test(text)) complexity += 1;
  if (complexity < 2) errors.push('密码需包含大写字母、小写字母、数字、特殊符号中的至少两种');
  if (WEAK_PASSWORDS.has(text.toLowerCase())) errors.push('密码过于简单，请更换');

  return { valid: errors.length === 0, errors };
}

// ==================== 时长归一化 ====================

/**
 * 把各种入参形态归一化成统一时长描述
 * 支持：durationMs / durationValue+durationUnit / days / isPermanent / -1
 */
function normalizeDuration(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const isPermanent =
    raw.isPermanent === true
    || Number(raw.durationValue) === -1
    || Number(raw.days) === -1;

  if (isPermanent) {
    return {
      isPermanent: true,
      durationValue: -1,
      durationUnit: 'day',
      durationMs: null,
      days: -1,
    };
  }

  const durationMs = Number(raw.durationMs);
  if (Number.isFinite(durationMs) && durationMs > 0) {
    const unit = raw.durationUnit === 'hour' ? 'hour' : 'day';
    const divisor = unit === 'hour' ? HOUR_MS : DAY_MS;
    return {
      isPermanent: false,
      durationMs,
      durationUnit: unit,
      durationValue: durationMs / divisor,
      days: durationMs / DAY_MS,
    };
  }

  const unit = raw.durationUnit === 'hour' ? 'hour' : 'day';
  const rawValue = raw.durationValue !== undefined ? raw.durationValue : raw.days;
  const value = toPositiveInt(rawValue, 1);
  const ms = unit === 'hour' ? value * HOUR_MS : value * DAY_MS;
  return {
    isPermanent: false,
    durationMs: ms,
    durationUnit: unit,
    durationValue: value,
    days: ms / DAY_MS,
  };
}

/** 格式化时长展示，例如 "3天" / "12小时" / "永久" */
function formatDuration(duration) {
  if (!duration) return '未激活';
  if (duration.isPermanent) return '永久';
  const ms = Number(duration.durationMs) || 0;
  if (ms <= 0) return '未激活';
  const totalHours = Math.round(ms / HOUR_MS);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0 && hours > 0) return `${days}天${hours}小时`;
  if (days > 0) return `${days}天`;
  if (hours > 0) return `${hours}小时`;
  return `${Math.round(ms / MINUTE_MS)}分钟`;
}

// ==================== 有效期计算 ====================

/**
 * 计算叠加一段时长后的有效期
 * 规则：
 *   - 永久卡 > 一切，命中即永久
 *   - 已是永久，继续加时不改变结果
 *   - 未过期：在剩余有效期上顺延（expiresAt + deltaMs）
 *   - 已过期/未激活：从当前时间重新起算（now + deltaMs）
 */
function computeNextExpiry(currentSubscription, duration, timestamp = now()) {
  const current = currentSubscription && typeof currentSubscription === 'object'
    ? currentSubscription
    : {};
  if (duration.isPermanent || current.isPermanent === true) {
    return { expiresAt: null, isPermanent: true };
  }
  const previous = Number(current.expiresAt);
  const anchor = Number.isFinite(previous) && previous > timestamp ? previous : timestamp;
  return { expiresAt: anchor + duration.durationMs, isPermanent: false };
}

/** 判断订阅是否已过期（永久/无有效期视为有效） */
function isSubscriptionExpired(subscription, timestamp = now()) {
  if (!subscription) return false;
  if (subscription.isPermanent === true) return false;
  const expiresAt = Number(subscription.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return false;
  return expiresAt <= timestamp;
}

/** 剩余有效毫秒数，永久返回 null */
function getRemainingMs(subscription, timestamp = now()) {
  if (!subscription) return 0;
  if (subscription.isPermanent === true) return null;
  const expiresAt = Number(subscription.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return 0;
  return Math.max(0, expiresAt - timestamp);
}

// ==================== 持久化 ====================

const emptyUsersDoc = () => ({ users: [], version: 1 });
const emptyCardsDoc = () => ({ cards: [], version: 1 });
const emptyRedemptionsDoc = () => ({ redemptions: [], counter: 0, version: 1 });
const emptyLogsDoc = () => ({ logs: [], counter: 0, version: 1 });

function loadDoc(file, emptyFactory) {
  ensureDataDir();
  const doc = readJsonFile(file, emptyFactory);
  return doc && typeof doc === 'object' ? doc : emptyFactory();
}

function saveDoc(file, doc) {
  ensureDataDir();
  writeJsonFileAtomic(file, doc);
}

// ==================== 用户表 ====================

function loadUsers() {
  const doc = loadDoc(USERS_FILE, emptyUsersDoc);
  return Array.isArray(doc.users) ? doc.users : [];
}

function saveUsers(users) {
  saveDoc(USERS_FILE, { users, version: 1 });
}

function loadCards() {
  const doc = loadDoc(CARDS_FILE, emptyCardsDoc);
  return Array.isArray(doc.cards) ? doc.cards : [];
}

function saveCards(cards) {
  saveDoc(CARDS_FILE, { cards, version: 1 });
}

function loadRedemptions() {
  const doc = loadDoc(REDEMPTIONS_FILE, emptyRedemptionsDoc);
  return {
    redemptions: Array.isArray(doc.redemptions) ? doc.redemptions : [],
    counter: toInt(doc.counter, 0),
  };
}

function saveRedemptions(state) {
  saveDoc(REDEMPTIONS_FILE, {
    redemptions: state.redemptions,
    counter: state.counter,
    version: 1,
  });
}

// ==================== 用户对象标准化 ====================

function normalizeSubscription(raw, fallbackUsername = '') {
  const input = raw && typeof raw === 'object' ? raw : {};
  const isPermanent = input.isPermanent === true;
  const expiresAtRaw = Number(input.expiresAt);
  return {
    code: String(input.code || ''),
    description: String(input.description || ''),
    expiresAt: isPermanent || !Number.isFinite(expiresAtRaw) || expiresAtRaw <= 0
      ? null
      : expiresAtRaw,
    isPermanent,
    enabled: input.enabled !== false,
    source: String(input.source || ''),
    activatedAt: Number(input.activatedAt) || null,
    totalAddedMs: Number(input.totalAddedMs) || 0,
    updatedAt: Number(input.updatedAt) || null,
    owner: String(input.owner || fallbackUsername || ''),
  };
}

function normalizeUser(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const role = [USER_ROLES.USER, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN].includes(input.role)
    ? input.role
    : USER_ROLES.USER;
  const accountLimitRaw = toInt(input.accountLimit, Number.NaN);
  let accountLimit = Number.isFinite(accountLimitRaw) ? accountLimitRaw : DEFAULT_ACCOUNT_LIMIT;
  if (isElevatedRole(role)) accountLimit = UNLIMITED;
  return {
    id: String(input.id || createId('u_')),
    username: String(input.username || '').trim(),
    password: String(input.password || ''),
    role,
    nick: String(input.nick || ''),
    email: String(input.email || ''),
    phone: String(input.phone || ''),
    accountLimit,
    subscription: normalizeSubscription(input.subscription || input.card, input.username),
    remark: String(input.remark || ''),
    mustChangePassword: input.mustChangePassword === true,
    createdAt: Number(input.createdAt) || now(),
    updatedAt: Number(input.updatedAt) || Number(input.createdAt) || now(),
    createdBy: String(input.createdBy || ''),
    lastLoginAt: Number(input.lastLoginAt) || null,
    lastLoginIp: String(input.lastLoginIp || ''),
  };
}

/** 对外输出的用户信息（不含密码），同时提供 card 别名以兼容旧调用方 */
function toPublicUser(user, extra = {}) {
  if (!user) return null;
  const subscription = normalizeSubscription(user.subscription, user.username);
  const isExpired = isSubscriptionExpired(subscription);
  const remainingMs = getRemainingMs(subscription);
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    nick: user.nick || '',
    email: user.email || '',
    phone: user.phone || '',
    remark: user.remark || '',
    accountLimit: user.accountLimit,
    subscription,
    /** @deprecated 兼容旧字段，等价于 subscription */
    card: subscription,
    isExpired,
    remainingMs,
    remainingText: formatRemaining(remainingMs),
    expiresAtText: formatExpiresAt(subscription),
    mustChangePassword: user.mustChangePassword === true,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    createdBy: user.createdBy || '',
    lastLoginAt: user.lastLoginAt || null,
    lastLoginIp: user.lastLoginIp || '',
    ...extra,
  };
}

function formatRemaining(remainingMs) {
  if (remainingMs === null) return '永久有效';
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '已过期';
  return formatDuration({ isPermanent: false, durationMs: remainingMs });
}

function formatExpiresAt(subscription) {
  if (!subscription) return '未激活';
  if (subscription.isPermanent) return '永久有效';
  if (!subscription.expiresAt) return '未激活';
  return new Date(subscription.expiresAt).toLocaleString('zh-CN', { hour12: false });
}

function findUserRecord(users, username) {
  const target = String(username || '').trim();
  if (!target) return null;
  return users.find(item => item.username === target) || null;
}

// ==================== 卡密表 ====================

function generateCardCode() {
  const groups = Math.max(1, USER_SYSTEM_CONFIG.cardCodeGroups);
  const size = Math.max(3, USER_SYSTEM_CONFIG.cardCodeGroupLength);
  const out = [];
  for (let g = 0; g < groups; g += 1) {
    let chunk = '';
    const bytes = crypto.randomBytes(size);
    for (let i = 0; i < size; i += 1) {
      chunk += CARD_ALPHABET[bytes[i] % CARD_ALPHABET.length];
    }
    out.push(chunk);
  }
  return out.join('-');
}

function normalizeCard(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const type = input.type === CARD_TYPES.QUOTA ? CARD_TYPES.QUOTA : CARD_TYPES.TIME;
  const usedBy = String(input.usedBy || '').trim();
  const revoked = input.revoked === true || input.status === CARD_STATUS.REVOKED;
  const enabled = revoked ? false : input.enabled !== false;
  const status = revoked
    ? CARD_STATUS.REVOKED
    : (usedBy ? CARD_STATUS.USED : (enabled ? CARD_STATUS.UNUSED : CARD_STATUS.DISABLED));

  const card = {
    code: String(input.code || generateCardCode()).toUpperCase(),
    type,
    description: String(input.description || ''),
    enabled,
    revoked,
    status,
    usedBy: usedBy || null,
    usedAt: Number(input.usedAt) || null,
    batchId: String(input.batchId || ''),
    createdAt: Number(input.createdAt) || now(),
    createdBy: String(input.createdBy || ''),
    updatedAt: Number(input.updatedAt) || null,
    revokedAt: Number(input.revokedAt) || null,
  };

  if (type === CARD_TYPES.QUOTA) {
    card.value = toPositiveInt(input.value ?? input.days, 1);
    card.days = card.value;
    card.durationValue = card.value;
    card.durationUnit = 'unit';
    card.durationMs = null;
    card.isPermanent = false;
  } else {
    const duration = normalizeDuration(input);
    card.durationValue = duration.durationValue;
    card.durationUnit = duration.durationUnit;
    card.durationMs = duration.durationMs;
    card.days = duration.days;
    card.isPermanent = duration.isPermanent;
    card.value = duration.isPermanent ? -1 : duration.durationValue;
  }
  card.durationText = type === CARD_TYPES.QUOTA
    ? `+${card.value} 额度`
    : formatDuration(card);
  return card;
}

/** 卡密面值展示：时间卡显示时长，额度卡显示配额 */
function describeCardValue(card) {
  if (!card) return '';
  if (card.type === CARD_TYPES.QUOTA) return `+${card.value} 个账号额度`;
  if (card.isPermanent) return '永久';
  return formatDuration(card);
}

// ==================== 核销流水 ====================

function appendRedemption(payload) {
  const state = loadRedemptions();
  state.counter += 1;
  const record = {
    id: String(state.counter),
    at: payload.at || now(),
    code: String(payload.code || ''),
    cardType: String(payload.cardType || CARD_TYPES.TIME),
    username: String(payload.username || ''),
    operator: String(payload.operator || payload.username || ''),
    action: String(payload.action || 'redeem'),
    summary: String(payload.summary || ''),
    before: payload.before || null,
    after: payload.after || null,
  };
  state.redemptions.push(record);
  const limit = toInt(USER_SYSTEM_CONFIG.loginLogLimit, 5000) * 2;
  if (state.redemptions.length > limit) {
    state.redemptions = state.redemptions.slice(-limit);
  }
  saveRedemptions(state);
  return record;
}

function getRedemptions({ username = '', code = '', limit = 100, offset = 0 } = {}) {
  const state = loadRedemptions();
  let list = state.redemptions.slice().reverse();
  if (username) list = list.filter(item => item.username === username);
  if (code) list = list.filter(item => item.code === code);
  const total = list.length;
  const size = Math.min(Math.max(toInt(limit, 100), 1), 500);
  const start = Math.max(toInt(offset, 0), 0);
  return { redemptions: list.slice(start, start + size), total };
}

// ==================== 登录限流 ====================

function loadAttempts() {
  const doc = loadDoc(LOGIN_ATTEMPTS_FILE, () => ({}));
  return doc && typeof doc === 'object' ? doc : {};
}

function saveAttempts(attempts) {
  saveDoc(LOGIN_ATTEMPTS_FILE, attempts);
}

function cleanExpiredAttempts(attempts) {
  const timestamp = now();
  let changed = false;
  for (const key of Object.keys(attempts)) {
    const entry = attempts[key];
    if (!entry || typeof entry !== 'object') {
      delete attempts[key];
      changed = true;
      continue;
    }
    if (entry.lockedUntil && Number(entry.lockedUntil) < timestamp) {
      delete attempts[key];
      changed = true;
      continue;
    }
    if (!entry.lockedUntil
      && Number(entry.windowStart) > 0
      && timestamp - Number(entry.windowStart) > USER_SYSTEM_CONFIG.ipRateLimitWindowMs) {
      delete attempts[key];
      changed = true;
    }
  }
  return changed;
}

function checkRateLimit(ip) {
  const attempts = loadAttempts();
  cleanExpiredAttempts(attempts);
  const key = `ip:${ip}`;
  const timestamp = now();
  const entry = attempts[key];

  if (!entry) {
    attempts[key] = { count: 1, windowStart: timestamp };
    saveAttempts(attempts);
    return { allowed: true };
  }

  if (entry.lockedUntil && Number(entry.lockedUntil) > timestamp) {
    const remainingMs = Number(entry.lockedUntil) - timestamp;
    return {
      allowed: false,
      remainingMs,
      message: `该 IP 登录失败过多，请 ${Math.ceil(remainingMs / 1000)} 秒后重试`,
    };
  }

  if (timestamp - Number(entry.windowStart || 0) > USER_SYSTEM_CONFIG.ipRateLimitWindowMs) {
    attempts[key] = { count: 1, windowStart: timestamp };
    saveAttempts(attempts);
    return { allowed: true };
  }

  if (Number(entry.count) >= USER_SYSTEM_CONFIG.ipMaxAttemptsPerWindow) {
    const lockMs = USER_SYSTEM_CONFIG.ipLockoutMinutes * MINUTE_MS;
    entry.lockedUntil = timestamp + lockMs;
    saveAttempts(attempts);
    return {
      allowed: false,
      remainingMs: lockMs,
      message: `该 IP 登录失败过多，请 ${Math.ceil(lockMs / 1000)} 秒后重试`,
    };
  }

  entry.count = Number(entry.count || 0) + 1;
  saveAttempts(attempts);
  return { allowed: true };
}

function checkAccountLockout(username) {
  const attempts = loadAttempts();
  cleanExpiredAttempts(attempts);
  const key = `user:${username}`;
  const entry = attempts[key];
  const timestamp = now();
  if (entry && entry.lockedUntil && Number(entry.lockedUntil) > timestamp) {
    const remainingMs = Number(entry.lockedUntil) - timestamp;
    return {
      locked: true,
      remainingMs,
      message: `账户已被锁定，请 ${Math.ceil(remainingMs / MINUTE_MS)} 分钟后重试`,
    };
  }
  return { locked: false };
}

function recordFailedAttempt(username) {
  const attempts = loadAttempts();
  const key = `user:${username}`;
  const entry = attempts[key] || { count: 0 };
  entry.count = Number(entry.count || 0) + 1;
  entry.lastAttempt = now();
  attempts[key] = entry;

  if (entry.count >= USER_SYSTEM_CONFIG.maxLoginAttempts) {
    const lockMs = USER_SYSTEM_CONFIG.lockoutMinutes * MINUTE_MS;
    entry.lockedUntil = now() + lockMs;
    saveAttempts(attempts);
    return { locked: true, message: `登录失败次数过多，账户已锁定 ${USER_SYSTEM_CONFIG.lockoutMinutes} 分钟` };
  }
  saveAttempts(attempts);
  return { locked: false, remainingAttempts: USER_SYSTEM_CONFIG.maxLoginAttempts - entry.count };
}

function clearAttempts(username, ip) {
  const attempts = loadAttempts();
  let changed = false;
  if (username && attempts[`user:${username}`]) {
    delete attempts[`user:${username}`];
    changed = true;
  }
  if (ip && attempts[`ip:${ip}`]) {
    delete attempts[`ip:${ip}`];
    changed = true;
  }
  if (changed) saveAttempts(attempts);
}

function clearIpAttempts(ip) {
  clearAttempts(null, ip);
}

// ==================== 登录日志 ====================

function loadLogs() {
  const doc = loadDoc(LOGIN_LOGS_FILE, emptyLogsDoc);
  return {
    logs: Array.isArray(doc.logs) ? doc.logs : [],
    counter: toInt(doc.counter, 0),
  };
}

function saveLogs(state) {
  saveDoc(LOGIN_LOGS_FILE, { logs: state.logs, counter: state.counter, version: 1 });
}

function addLoginLog(event, username, errorType, ip, userAgent) {
  const state = loadLogs();
  state.counter += 1;
  state.logs.push({
    id: String(state.counter),
    timestamp: now(),
    event: String(event || ''),
    username: String(username || ''),
    errorType: errorType || null,
    ip: String(ip || 'unknown'),
    userAgent: String(userAgent || 'unknown'),
  });
  const limit = toInt(USER_SYSTEM_CONFIG.loginLogLimit, 5000);
  if (state.logs.length > limit) state.logs = state.logs.slice(-limit);
  saveLogs(state);
}

function getLoginLogs({ limit = 100, offset = 0, username = '', event = '' } = {}) {
  const state = loadLogs();
  let list = state.logs.slice().reverse();
  if (username) list = list.filter(item => item.username === username);
  if (event) list = list.filter(item => item.event === event);
  const total = list.length;
  const size = Math.min(Math.max(toInt(limit, 100), 1), 500);
  const start = Math.max(toInt(offset, 0), 0);
  return { logs: list.slice(start, start + size), total };
}

function clearLoginLogs() {
  saveLogs({ logs: [], counter: 0 });
  return { ok: true };
}

// ==================== 卡密核销核心 ====================

/**
 * 校验卡密是否可用（不修改状态）
 * @returns {object} { ok, error?, card? } —— ok 为 false 时 error 说明原因
 */
function verifyCardUsable(card, { allowQuota = true, allowTime = true } = {}) {
  if (!card) return { ok: false, error: '卡密不存在' };
  if (card.revoked === true) return { ok: false, error: '卡密已作废' };
  if (card.enabled === false) return { ok: false, error: '卡密已被禁用' };
  if (card.usedBy) return { ok: false, error: '卡密已被使用' };
  const type = card.type || CARD_TYPES.TIME;
  if (type === CARD_TYPES.QUOTA && !allowQuota) {
    return { ok: false, error: '此处只能使用加时卡密，额度卡密请在登录后续费使用' };
  }
  if (type === CARD_TYPES.TIME && !allowTime) {
    return { ok: false, error: '此处只能使用额度卡密' };
  }
  return { ok: true, card };
}

function findCardByCode(cards, code) {
  const target = String(code || '').trim().toUpperCase();
  if (!target) return null;
  return cards.find(card => String(card.code || '').toUpperCase() === target) || null;
}

/**
 * 核销一张卡密到指定用户
 *
 * 规则：
 *   - 加时卡：延长有效期；已经过期的从当前时间重新起算；永久卡置为永久
 *   - 额度卡：accountLimit += value（-1 表示不限，保持不变）
 *   - 核销即锁定卡密（usedBy/usedAt），并写入核销流水
 */
function redeemCard(username, code, { operator = '', allowQuota = true, allowTime = true } = {}) {
  const target = String(username || '').trim();
  if (!target) return { ok: false, error: '请提供用户名' };
  const cardCode = String(code || '').trim();
  if (!cardCode) return { ok: false, error: '请提供卡密' };

  const users = loadUsers();
  const user = findUserRecord(users, target);
  if (!user) return { ok: false, error: '用户不存在' };

  const cards = loadCards();
  const card = findCardByCode(cards, cardCode);
  const usable = verifyCardUsable(card, { allowQuota, allowTime });
  if (!usable.ok) return usable;

  const timestamp = now();
  const type = card.type || CARD_TYPES.TIME;
  const before = {
    expiresAt: user.subscription ? user.subscription.expiresAt : null,
    isPermanent: user.subscription ? user.subscription.isPermanent === true : false,
    accountLimit: user.accountLimit,
  };

  let summary = '';
  if (type === CARD_TYPES.QUOTA) {
    const value = toPositiveInt(card.value, 1);
    if (user.accountLimit !== UNLIMITED) {
      user.accountLimit = toInt(user.accountLimit, DEFAULT_ACCOUNT_LIMIT) + value;
    }
    summary = `额度 +${value}`;
  } else {
    const duration = normalizeDuration(card);
    const next = computeNextExpiry(user.subscription, duration, timestamp);
    const subscription = normalizeSubscription(user.subscription, user.username);
    subscription.expiresAt = next.expiresAt;
    subscription.isPermanent = next.isPermanent;
    subscription.enabled = true;
    subscription.code = card.code;
    subscription.description = card.description || '';
    subscription.source = operator && operator !== user.username ? 'admin' : 'renew';
    subscription.activatedAt = subscription.activatedAt || timestamp;
    subscription.totalAddedMs = toInt(subscription.totalAddedMs, 0)
      + (duration.isPermanent ? 0 : duration.durationMs);
    subscription.updatedAt = timestamp;
    subscription.owner = user.username;
    user.subscription = subscription;
    summary = duration.isPermanent ? '永久有效' : `有效期 +${formatDuration(duration)}`;
  }

  card.usedBy = user.username;
  card.usedAt = timestamp;
  card.status = CARD_STATUS.USED;
  card.updatedAt = timestamp;
  user.updatedAt = timestamp;

  saveUsers(users);
  saveCards(cards);

  const after = {
    expiresAt: user.subscription ? user.subscription.expiresAt : null,
    isPermanent: user.subscription ? user.subscription.isPermanent === true : false,
    accountLimit: user.accountLimit,
  };

  appendRedemption({
    at: timestamp,
    code: card.code,
    cardType: type,
    username: user.username,
    operator: operator || user.username,
    action: 'redeem',
    summary,
    before,
    after,
  });

  return {
    ok: true,
    cardType: type,
    summary,
    subscription: user.subscription,
    accountLimit: user.accountLimit,
    user: toPublicUser(user),
  };
}

// ==================== 注册 ====================

function validateUsername(username) {
  const text = String(username || '').trim();
  if (!USERNAME_RE.test(text)) {
    return { ok: false, error: '用户名需为 3-32 位字母、数字或下划线' };
  }
  return { ok: true, username: text };
}

/**
 * 用户注册（绑定卡密）
 * 注册必须使用「加时卡」，卡密面值决定初始有效期。
 */
function registerUser(username, password, cardCode, options = {}) {
  if (!USER_SYSTEM_CONFIG.allowRegister && !options.byAdmin) {
    return { ok: false, error: '当前未开放自助注册，请联系管理员开号' };
  }
  const nameCheck = validateUsername(username);
  if (!nameCheck.ok) return nameCheck;

  const pwdCheck = validatePasswordStrength(password);
  if (!pwdCheck.valid) return { ok: false, error: pwdCheck.errors.join('；') };

  const users = loadUsers();
  if (findUserRecord(users, nameCheck.username)) {
    return { ok: false, error: '用户名已存在' };
  }

  const cards = loadCards();
  const card = findCardByCode(cards, cardCode);
  const usable = verifyCardUsable(card, {
    allowQuota: options.allowQuota === true,
    allowTime: true,
  });
  if (!usable.ok) return usable;

  const timestamp = now();
  const duration = normalizeDuration(card);
  const subscription = normalizeSubscription({}, nameCheck.username);
  subscription.code = card.code;
  subscription.description = card.description || '';
  subscription.source = 'register';
  subscription.activatedAt = timestamp;
  subscription.updatedAt = timestamp;
  subscription.totalAddedMs = duration.isPermanent ? 0 : duration.durationMs;
  if (duration.isPermanent) {
    subscription.isPermanent = true;
    subscription.expiresAt = null;
  } else {
    subscription.isPermanent = false;
    subscription.expiresAt = timestamp + duration.durationMs;
  }

  const user = normalizeUser({
    username: nameCheck.username,
    password: hashPassword(password),
    role: USER_ROLES.USER,
    accountLimit: DEFAULT_ACCOUNT_LIMIT,
    subscription,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: String(options.createdBy || 'register'),
  });
  users.push(user);

  card.usedBy = user.username;
  card.usedAt = timestamp;
  card.status = CARD_STATUS.USED;
  card.updatedAt = timestamp;

  saveUsers(users);
  saveCards(cards);
  clearAttempts(user.username, options.ip);

  appendRedemption({
    at: timestamp,
    code: card.code,
    cardType: card.type || CARD_TYPES.TIME,
    username: user.username,
    operator: user.username,
    action: 'register',
    summary: duration.isPermanent ? '注册并激活永久' : `注册并激活 ${formatDuration(duration)}`,
    before: null,
    after: {
      expiresAt: subscription.expiresAt,
      isPermanent: subscription.isPermanent,
      accountLimit: user.accountLimit,
    },
  });

  return { ok: true, user: toPublicUser(user) };
}

/** 管理员直接开号（可不使用卡密，直接指定有效期/额度） */
function createUserByAdmin({ username, password, role = USER_ROLES.USER, accountLimit, expiresAt, isPermanent, nick, email, phone, remark, operator = '' }) {
  const nameCheck = validateUsername(username);
  if (!nameCheck.ok) return nameCheck;

  const pwdCheck = validatePasswordStrength(password);
  if (!pwdCheck.valid) return { ok: false, error: pwdCheck.errors.join('；') };

  const users = loadUsers();
  if (findUserRecord(users, nameCheck.username)) {
    return { ok: false, error: '用户名已存在' };
  }

  const timestamp = now();
  const subscription = normalizeSubscription({}, nameCheck.username);
  subscription.source = 'admin';
  subscription.activatedAt = timestamp;
  subscription.updatedAt = timestamp;
  if (isPermanent === true) {
    subscription.isPermanent = true;
    subscription.expiresAt = null;
  } else if (Number.isFinite(Number(expiresAt)) && Number(expiresAt) > 0) {
    subscription.expiresAt = Number(expiresAt);
    subscription.isPermanent = false;
  } else {
    subscription.expiresAt = null;
    subscription.isPermanent = false;
  }

  const targetRole = [USER_ROLES.USER, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN].includes(role)
    ? role
    : USER_ROLES.USER;
  const user = normalizeUser({
    username: nameCheck.username,
    password: hashPassword(password),
    role: targetRole,
    nick: nick || '',
    email: email || '',
    phone: phone || '',
    remark: remark || '',
    accountLimit: isElevatedRole(targetRole)
      ? UNLIMITED
      : (Number.isFinite(Number(accountLimit)) ? toInt(accountLimit, DEFAULT_ACCOUNT_LIMIT) : DEFAULT_ACCOUNT_LIMIT),
    subscription,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: operator || 'admin',
  });
  users.push(user);
  saveUsers(users);
  return { ok: true, user: toPublicUser(user) };
}

// ==================== 登录校验 ====================

/**
 * 校验用户名密码
 * @returns {object} 成功返回用户会话数据，失败返回 { error, message }
 */
function validateUser(username, password, ip = 'unknown') {
  const inputName = String(username || '').trim();
  if (!inputName || !password) {
    return { error: 'invalid_credentials', message: '请输入用户名和密码' };
  }

  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return { error: 'rate_limit', message: rate.message, remainingMs: rate.remainingMs };
  }

  // 超级管理员（环境变量配置）
  const superName = String(USER_SYSTEM_CONFIG.superAdminUsername || '').trim();
  if (superName && inputName === superName) {
    if (String(password) !== String(USER_SYSTEM_CONFIG.superAdminPassword)) {
      recordFailedAttempt(inputName);
      return { error: 'invalid_credentials', message: '用户名或密码错误' };
    }
    clearAttempts(inputName, ip);
    return {
      id: 'super_admin',
      username: superName,
      role: USER_ROLES.SUPER_ADMIN,
      accountLimit: UNLIMITED,
      subscription: normalizeSubscription({ isPermanent: true, source: 'config' }, superName),
      card: normalizeSubscription({ isPermanent: true, source: 'config' }, superName),
      mustChangePassword: false,
    };
  }

  const lockout = checkAccountLockout(inputName);
  if (lockout.locked) {
    return { error: 'locked', message: lockout.message, remainingMs: lockout.remainingMs };
  }

  const users = loadUsers();
  const user = findUserRecord(users, inputName);
  if (!user) {
    recordFailedAttempt(inputName);
    return { error: 'invalid_credentials', message: '用户名或密码错误' };
  }

  if (!verifyPassword(password, user.password)) {
    const result = recordFailedAttempt(inputName);
    if (result.locked) return { error: 'locked', message: result.message };
    return {
      error: 'invalid_credentials',
      message: `用户名或密码错误，剩余尝试次数: ${result.remainingAttempts}`,
    };
  }

  clearAttempts(inputName, ip);

  if (needsRehash(user.password)) {
    user.password = hashPassword(password);
  }
  user.lastLoginAt = now();
  user.lastLoginIp = String(ip || '');
  saveUsers(users);

  const publicUser = toPublicUser(user);
  return {
    id: publicUser.id,
    username: publicUser.username,
    role: publicUser.role,
    accountLimit: publicUser.accountLimit,
    subscription: publicUser.subscription,
    card: publicUser.subscription,
    mustChangePassword: publicUser.mustChangePassword,
  };
}

/** 续费（登录用户自助） */
function renewUser(username, cardCode) {
  return redeemCard(username, cardCode, { operator: username });
}

// ==================== 用户查询 ====================

function getUserByName(username) {
  const users = loadUsers();
  const user = findUserRecord(users, username);
  return user ? toPublicUser(user) : null;
}

function getAllUsers() {
  return loadUsers().map(user => toPublicUser(user));
}

/** 管理员列表页：额外附带农场账号数量（由调用方注入 countAccounts） */
function listUsersForAdmin({ countAccounts } = {}) {
  return getAllUsers().map((user) => {
    const extra = {};
    if (typeof countAccounts === 'function') {
      try {
        extra.accountCount = toInt(countAccounts(user.username), 0);
      } catch {
        extra.accountCount = 0;
      }
    }
    return { ...user, ...extra };
  });
}

function getUserCount() {
  return loadUsers().length;
}

// ==================== 用户编辑 ====================

function updateUser(username, updates = {}) {
  const users = loadUsers();
  const user = findUserRecord(users, username);
  if (!user) return { ok: false, error: '用户不存在' };

  const timestamp = now();
  const subscription = normalizeSubscription(user.subscription, user.username);

  if (updates.enabled !== undefined) {
    subscription.enabled = updates.enabled !== false;
  }
  if (updates.isPermanent === true) {
    subscription.isPermanent = true;
    subscription.expiresAt = null;
  } else if (updates.expiresAt !== undefined) {
    const next = Number(updates.expiresAt);
    if (!Number.isFinite(next) || next <= 0) {
      subscription.expiresAt = null;
      subscription.isPermanent = false;
    } else {
      subscription.expiresAt = next;
      subscription.isPermanent = false;
    }
  }
  subscription.updatedAt = timestamp;
  user.subscription = subscription;
  user.updatedAt = timestamp;
  saveUsers(users);
  return { ok: true, user: toPublicUser(user) };
}

/**
 * 编辑用户资料（管理员）
 * 支持改用户名、密码、角色、额度、有效期、备注
 */
function editUser(username, updates = {}) {
  const users = loadUsers();
  const user = findUserRecord(users, username);
  if (!user) return { ok: false, error: '用户不存在' };

  const timestamp = now();

  if (updates.newUsername && updates.newUsername !== username) {
    const nameCheck = validateUsername(updates.newUsername);
    if (!nameCheck.ok) return nameCheck;
    if (findUserRecord(users, nameCheck.username)) {
      return { ok: false, error: '用户名已存在' };
    }
    user.username = nameCheck.username;
  }

  if (updates.password !== undefined && String(updates.password).length > 0) {
    const pwdCheck = validatePasswordStrength(updates.password);
    if (!pwdCheck.valid) return { ok: false, error: pwdCheck.errors.join('；') };
    user.password = hashPassword(updates.password);
    user.mustChangePassword = false;
  }

  if (
    updates.role !== undefined
    && [USER_ROLES.USER, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN].includes(updates.role)
  ) {
    user.role = updates.role;
    if (isElevatedRole(user.role)) user.accountLimit = UNLIMITED;
  }

  if (updates.accountLimit !== undefined && !isElevatedRole(user.role)) {
    const next = toInt(updates.accountLimit, DEFAULT_ACCOUNT_LIMIT);
    user.accountLimit = next < 0 ? UNLIMITED : next;
  }

  const subscription = normalizeSubscription(user.subscription, user.username);
  if (updates.enabled !== undefined) subscription.enabled = updates.enabled !== false;
  if (updates.isPermanent === true) {
    subscription.isPermanent = true;
    subscription.expiresAt = null;
  } else if (updates.expiresAt !== undefined) {
    const next = Number(updates.expiresAt);
    if (!Number.isFinite(next) || next <= 0) {
      subscription.expiresAt = null;
      subscription.isPermanent = false;
    } else {
      subscription.expiresAt = next;
      subscription.isPermanent = false;
    }
  }
  subscription.updatedAt = timestamp;
  user.subscription = subscription;

  if (updates.nick !== undefined) user.nick = String(updates.nick || '');
  if (updates.email !== undefined) user.email = String(updates.email || '');
  if (updates.phone !== undefined) user.phone = String(updates.phone || '');
  if (updates.remark !== undefined) user.remark = String(updates.remark || '');
  user.updatedAt = timestamp;

  saveUsers(users);
  return { ok: true, user: toPublicUser(user) };
}

function deleteUser(username, { force = false } = {}) {
  const users = loadUsers();
  const index = users.findIndex(item => item.username === String(username || '').trim());
  if (index === -1) return { ok: false, error: '用户不存在' };
  const user = users[index];
  if (!force && isElevatedRole(user.role)) {
    return { ok: false, error: '不能删除管理员账号，如需删除请勾选强制' };
  }
  if (user.username === USER_SYSTEM_CONFIG.bootstrapAdminUsername && !force) {
    return { ok: false, error: '不能删除引导管理员账号' };
  }
  users.splice(index, 1);
  saveUsers(users);
  return { ok: true, deletedUsername: user.username };
}

function changePassword(username, currentPassword, newPassword) {
  const users = loadUsers();
  const user = findUserRecord(users, username);
  if (!user) return { ok: false, error: '用户不存在' };
  if (!verifyPassword(currentPassword, user.password)) {
    return { ok: false, error: '当前密码错误' };
  }
  const pwdCheck = validatePasswordStrength(newPassword);
  if (!pwdCheck.valid) return { ok: false, error: pwdCheck.errors.join('；') };
  user.password = hashPassword(newPassword);
  user.mustChangePassword = false;
  user.updatedAt = now();
  saveUsers(users);
  return { ok: true, message: '密码修改成功' };
}

/** 通过卡密找回密码：需该卡密已被目标用户核销过 */
function verifyCardOwnership(username, cardCode) {
  const users = loadUsers();
  const user = findUserRecord(users, username);
  if (!user) return { ok: false, error: '用户名或卡密错误' };
  const cards = loadCards();
  const card = findCardByCode(cards, cardCode);
  if (!card) return { ok: false, error: '用户名或卡密错误' };
  if (card.usedBy !== user.username) return { ok: false, error: '卡密不属于该用户' };
  return { ok: true };
}

function resetPasswordByCard(username, cardCode, newPassword) {
  const ownership = verifyCardOwnership(username, cardCode);
  if (!ownership.ok) return ownership;
  const pwdCheck = validatePasswordStrength(newPassword);
  if (!pwdCheck.valid) return { ok: false, error: pwdCheck.errors.join('；') };
  const users = loadUsers();
  const user = findUserRecord(users, username);
  user.password = hashPassword(newPassword);
  user.mustChangePassword = false;
  user.updatedAt = now();
  saveUsers(users);
  clearAttempts(user.username, null);
  return { ok: true, message: '密码重置成功' };
}

/** 清理已过期普通用户（管理员手动触发，永不删除管理员） */
function clearExpiredUsers() {
  const users = loadUsers();
  const timestamp = now();
  const keep = [];
  const deletedUsers = [];
  for (const user of users) {
    if (isElevatedRole(user.role)) {
      keep.push(user);
      continue;
    }
    if (isSubscriptionExpired(user.subscription, timestamp)) {
      deletedUsers.push(user.username);
      continue;
    }
    keep.push(user);
  }
  if (deletedUsers.length > 0) saveUsers(keep);
  return { ok: true, deletedCount: deletedUsers.length, deletedUsers };
}

// ==================== 卡密管理 ====================

function getAllCards({ type = '', status = '', keyword = '' } = {}) {
  let cards = loadCards().map(normalizeCard);
  if (type) cards = cards.filter(card => card.type === type);
  if (status) cards = cards.filter(card => card.status === status);
  if (keyword) {
    const text = String(keyword).toLowerCase();
    cards = cards.filter(card =>
      String(card.code).toLowerCase().includes(text)
      || String(card.description).toLowerCase().includes(text)
      || String(card.usedBy || '').toLowerCase().includes(text));
  }
  return cards.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

function getCardByCode(code) {
  const card = findCardByCode(loadCards(), code);
  return card ? normalizeCard(card) : null;
}

/** 查询卡密详情（注册页预览用，不暴露敏感信息） */
function peekCard(code) {
  const card = getCardByCode(code);
  if (!card) return { ok: false, error: '卡密不存在' };
  if (card.revoked) return { ok: false, error: '卡密已作废' };
  if (!card.enabled) return { ok: false, error: '卡密已被禁用' };
  if (card.usedBy) return { ok: false, error: '卡密已被使用' };
  return {
    ok: true,
    card: {
      code: card.code,
      type: card.type,
      description: card.description,
      durationValue: card.durationValue,
      durationUnit: card.durationUnit,
      durationMs: card.durationMs,
      days: card.days,
      isPermanent: card.isPermanent,
      value: card.value,
      valueText: describeCardValue(card),
    },
  };
}

function createCard({ description, type = CARD_TYPES.TIME, days, durationValue, durationUnit, isPermanent, value, count = 1, createdBy = '' }) {
  const cardType = type === CARD_TYPES.QUOTA ? CARD_TYPES.QUOTA : CARD_TYPES.TIME;
  const requested = Number(cardType === CARD_TYPES.QUOTA ? value ?? days : durationValue ?? days);
  const permanentRequested = isPermanent === true || requested === -1;

  if (cardType === CARD_TYPES.TIME && !permanentRequested
    && (!Number.isFinite(requested) || requested <= 0)) {
    return { ok: false, error: '加时卡时长必须大于 0，永久卡请使用 -1' };
  }
  if (cardType === CARD_TYPES.QUOTA && (!Number.isFinite(requested) || requested <= 0)) {
    return { ok: false, error: '额度卡数量必须大于 0' };
  }

  const total = Math.min(Math.max(toInt(count, 1), 1), 200);
  const cards = loadCards();
  const batchId = createId('b_');
  const timestamp = now();
  const created = [];

  for (let i = 0; i < total; i += 1) {
    const card = normalizeCard({
      code: generateCardCode(),
      type: cardType,
      description: String(description || '').trim(),
      days: requested,
      durationValue: cardType === CARD_TYPES.TIME ? requested : undefined,
      durationUnit,
      isPermanent: permanentRequested,
      value: cardType === CARD_TYPES.QUOTA ? requested : undefined,
      enabled: true,
      usedBy: null,
      usedAt: null,
      batchId,
      createdAt: timestamp,
      createdBy,
    });
    cards.push(card);
    created.push(card);
  }
  saveCards(cards);
  return { ok: true, cards: created, batchId, count: created.length };
}

/** 更新卡密（描述 / 启停 / 作废） */
function updateCard(code, updates = {}) {
  const cards = loadCards();
  const index = cards.findIndex(card => String(card.code || '').toUpperCase() === String(code || '').toUpperCase());
  if (index === -1) return { ok: false, error: '卡密不存在' };

  const timestamp = now();
  const next = normalizeCard({
    ...cards[index],
    ...updates,
    code: cards[index].code,
    type: cards[index].type,
    updatedAt: timestamp,
  });

  if (updates.revoked === true) {
    next.revoked = true;
    next.enabled = false;
    next.revokedAt = timestamp;
  } else if (updates.revoked === false) {
    next.revoked = false;
    next.revokedAt = null;
  }
  if (updates.enabled !== undefined && next.revoked !== true) {
    next.enabled = updates.enabled !== false;
  }
  cards[index] = next;
  saveCards(cards);
  return { ok: true, card: next };
}

/** 作废卡密（不可再核销，已核销的历史不受影响） */
function revokeCard(code, operator = '') {
  const result = updateCard(code, { revoked: true });
  if (!result.ok) return result;
  appendRedemption({
    at: now(),
    code: result.card.code,
    cardType: result.card.type,
    username: String(result.card.usedBy || ''),
    operator: String(operator || 'admin'),
    action: 'revoke',
    summary: '卡密作废',
    before: { enabled: true, revoked: false },
    after: { enabled: false, revoked: true },
  });
  return result;
}

function deleteCard(code) {
  const cards = loadCards();
  const target = String(code || '').toUpperCase();
  const index = cards.findIndex(card => String(card.code || '').toUpperCase() === target);
  if (index === -1) return { ok: false, error: '卡密不存在' };
  const [removed] = cards.splice(index, 1);
  saveCards(cards);
  return { ok: true, card: normalizeCard(removed) };
}

function deleteCardsBatch(codes) {
  if (!Array.isArray(codes) || codes.length === 0) {
    return { ok: false, error: '请提供要删除的卡密列表' };
  }
  const targets = new Set(codes.map(code => String(code || '').toUpperCase()));
  const cards = loadCards();
  const kept = [];
  let deletedCount = 0;
  for (const card of cards) {
    if (targets.has(String(card.code || '').toUpperCase())) {
      deletedCount += 1;
      continue;
    }
    kept.push(card);
  }
  saveCards(kept);
  return { ok: true, deletedCount, notFoundCount: targets.size - deletedCount };
}

function getCardStats() {
  const cards = getAllCards();
  const stats = {
    total: cards.length,
    time: 0,
    quota: 0,
    unused: 0,
    used: 0,
    disabled: 0,
    revoked: 0,
  };
  for (const card of cards) {
    if (card.type === CARD_TYPES.QUOTA) stats.quota += 1;
    else stats.time += 1;
    if (card.status === CARD_STATUS.USED) stats.used += 1;
    else if (card.status === CARD_STATUS.REVOKED) stats.revoked += 1;
    else if (card.status === CARD_STATUS.DISABLED) stats.disabled += 1;
    else stats.unused += 1;
  }
  return stats;
}

// ==================== 卡密自助领取（发号机） ====================

const CARD_CLAIM_FILE = getDataFile('card-claim.json');
const CLAIM_INTERVAL_MS = DAY_MS;

function loadClaimRecords() {
  const doc = loadDoc(CARD_CLAIM_FILE, () => ({ enabled: USER_SYSTEM_CONFIG.cardClaimEnabled, records: [] }));
  return {
    enabled: doc.enabled === true,
    records: Array.isArray(doc.records) ? doc.records : [],
  };
}

function saveClaimRecords(state) {
  saveDoc(CARD_CLAIM_FILE, state);
}

function getCardClaimStatus() {
  const state = loadClaimRecords();
  const available = getAllCards().filter(card =>
    card.type === CARD_TYPES.TIME && !card.usedBy && card.enabled).length;
  return { enabled: state.enabled, availableTimeCards: available };
}

function setCardClaimStatus(enabled) {
  const state = loadClaimRecords();
  state.enabled = !!enabled;
  saveClaimRecords(state);
  return getCardClaimStatus();
}

/** 每个 UA 每 24 小时限领一张 */
function claimCardByUA(userAgent, username = null) {
  const state = loadClaimRecords();
  if (!state.enabled) return { ok: false, error: '卡密领取功能未开启' };

  const nowTs = now();
  const uaHash = crypto.createHash('sha256').update(String(userAgent || '')).digest('hex');
  const existing = state.records.find(item => item.uaHash === uaHash);
  if (existing && nowTs - Number(existing.claimTime || 0) < CLAIM_INTERVAL_MS) {
    const remainingMs = CLAIM_INTERVAL_MS - (nowTs - Number(existing.claimTime || 0));
    return { ok: false, error: '您已在 24 小时内领取过卡密', remainingMs };
  }

  const available = loadCards().filter(card =>
    (card.type || CARD_TYPES.TIME) === CARD_TYPES.TIME
    && !card.usedBy
    && card.enabled !== false
    && card.revoked !== true);
  if (available.length === 0) return { ok: false, error: '卡密库存不足，请联系管理员' };

  const picked = normalizeCard(available[Math.floor(Math.random() * available.length)]);
  state.records = state.records.filter(item => item.uaHash !== uaHash);
  state.records.push({
    uaHash,
    claimTime: nowTs,
    cardCode: picked.code,
    username: username || null,
  });
  if (state.records.length > 5000) state.records = state.records.slice(-5000);
  saveClaimRecords(state);

  return {
    ok: true,
    cardCode: picked.code,
    description: picked.description,
    valueText: describeCardValue(picked),
    isPermanent: picked.isPermanent,
  };
}

function getCardClaimRecords() {
  return loadClaimRecords().records;
}

// ==================== 额度校验 ====================

/**
 * 校验用户是否还能添加农场账号
 * @param {object} user - 会话中的用户对象
 * @param {number} currentCount - 该用户当前已添加的农场账号数
 */
function checkAccountQuota(user, currentCount = 0) {
  if (!user) return { ok: false, error: '未登录' };
  if (isElevatedRole(user.role)) {
    return { ok: true, limit: UNLIMITED, current: currentCount, remaining: UNLIMITED };
  }
  const limitRaw = Number(user.accountLimit);
  const limit = Number.isFinite(limitRaw) ? limitRaw : DEFAULT_ACCOUNT_LIMIT;
  if (limit === UNLIMITED) {
    return { ok: true, limit: UNLIMITED, current: currentCount, remaining: UNLIMITED };
  }
  const count = toInt(currentCount, 0);
  if (count >= limit) {
    return {
      ok: false,
      error: `已达账号额度上限（${limit} 个），请使用额度卡提升配额或删除旧账号`,
      limit,
      current: count,
      remaining: 0,
    };
  }
  return { ok: true, limit, current: count, remaining: limit - count };
}

// ==================== 初始化 ====================

let bootstrapped = false;

/** 首次启动创建引导管理员 */
function ensureBootstrapAdmin() {
  if (bootstrapped) return;
  bootstrapped = true;
  const users = loadUsers();
  const bootstrapName = String(USER_SYSTEM_CONFIG.bootstrapAdminUsername || '').trim();
  if (!bootstrapName) return;

  // 默认让内置管理员拥有超级管理员权限，避免出现"无人能管理管理员"的权限死锁
  const bootstrapRole = USER_SYSTEM_CONFIG.bootstrapAdminAsSuper === false
    ? USER_ROLES.ADMIN
    : USER_ROLES.SUPER_ADMIN;

  const existing = findUserRecord(users, bootstrapName);
  if (existing) {
    // 已存在（历史安装）：按当前配置补齐角色与额度
    let changed = false;
    if (bootstrapRole === USER_ROLES.SUPER_ADMIN && existing.role !== USER_ROLES.SUPER_ADMIN) {
      existing.role = USER_ROLES.SUPER_ADMIN;
      changed = true;
    }
    if (isElevatedRole(existing.role) && Number(existing.accountLimit) !== UNLIMITED) {
      existing.accountLimit = UNLIMITED;
      changed = true;
    }
    if (changed) {
      existing.updatedAt = now();
      saveUsers(users);
      console.log(`[用户系统] 内置管理员 ${bootstrapName} 已升级为超级管理员`);
    }
    return;
  }

  const timestamp = now();
  const admin = normalizeUser({
    username: bootstrapName,
    password: hashPassword(USER_SYSTEM_CONFIG.bootstrapAdminPassword),
    role: bootstrapRole,
    accountLimit: UNLIMITED,
    subscription: normalizeSubscription({
      isPermanent: true,
      source: 'bootstrap',
      description: '内置管理员',
      activatedAt: timestamp,
    }, bootstrapName),
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: 'bootstrap',
    remark: '系统内置管理员',
  });
  users.push(admin);
  saveUsers(users);
  console.log(`[用户系统] 已创建内置管理员：${bootstrapName}`);
}

ensureBootstrapAdmin();

// ==================== 导出 ====================

module.exports = {
  // 常量
  DEFAULT_ACCOUNT_LIMIT,
  ADMIN_ACCOUNT_LIMIT,
  UNLIMITED,
  USER_ROLES,
  CARD_TYPES,
  CARD_STATUS,
  isElevatedRole,

  // 工具
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  normalizeDuration,
  normalizeCard,
  formatDuration,
  describeCardValue,
  computeNextExpiry,
  isSubscriptionExpired,
  getRemainingMs,

  // 登录
  validateUser,
  registerUser,
  renewUser,
  redeemCard,
  changePassword,
  verifyCardOwnership,
  resetPasswordByCard,
  checkRateLimit,
  clearIpAttempts,
  clearAttempts,

  // 用户管理
  getAllUsers,
  listUsersForAdmin,
  getUserByName,
  getUserCount,
  createUserByAdmin,
  updateUser,
  editUser,
  deleteUser,
  clearExpiredUsers,

  // 卡密
  getAllCards,
  getCardByCode,
  peekCard,
  createCard,
  updateCard,
  revokeCard,
  deleteCard,
  deleteCardsBatch,
  getCardStats,

  // 核销流水 / 领取
  getRedemptions,
  getCardClaimStatus,
  setCardClaimStatus,
  claimCardByUA,
  getCardClaimRecords,

  // 额度
  checkAccountQuota,

  // 日志
  addLoginLog,
  getLoginLogs,
  clearLoginLogs,

  // 兼容旧导出名
  createCardsBatch: (description, days, count, type = CARD_TYPES.TIME, options = {}) =>
    createCard({
      description,
      type,
      days,
      count,
      durationValue: options.durationValue,
      durationUnit: options.durationUnit,
      isPermanent: options.isPermanent,
      value: options.value,
      createdBy: '',
    }),
  isSuperAdmin: (username) => {
    const configured = String(USER_SYSTEM_CONFIG.superAdminUsername || '').trim();
    if (configured && String(username || '').trim() === configured) return true;
    const user = getUserByName(username);
    return !!user && user.role === USER_ROLES.SUPER_ADMIN;
  },
  ensureBootstrapAdmin,
};
