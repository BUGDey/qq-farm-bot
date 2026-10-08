/**
 * 多用户账号与卡密体系 —— 运行时配置
 *
 * 所有配置均可通过环境变量覆盖，未设置时使用下方默认值。
 * 完整说明见 docs/多用户与卡密系统.md
 */
const process = require('node:process');

function readEnv(key, fallback = '') {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : String(value);
}

function readNumber(key, fallback) {
  const value = Number(readEnv(key, ''));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readBoolean(key, fallback) {
  const value = readEnv(key, '');
  if (value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const USER_SYSTEM_CONFIG = {
  /** 是否启用多用户体系；关闭时退化为内置管理员的单机模式 */
  enabled: readBoolean('FARM_USER_SYSTEM_ENABLED', true),

  /** 是否开放自助注册（关闭后只能由管理员开号） */
  allowRegister: readBoolean('FARM_ALLOW_REGISTER', true),

  /** 是否开放"公开续费/找回密码"接口（无需登录，凭用户名+卡密） */
  allowPublicRenew: readBoolean('FARM_ALLOW_PUBLIC_RENEW', true),
  allowPublicResetPassword: readBoolean('FARM_ALLOW_PUBLIC_RESET_PASSWORD', true),

  /** 是否开放卡密自助领取（发号机） */
  cardClaimEnabled: readBoolean('FARM_CARD_CLAIM_ENABLED', false),

  /** 新用户默认可添加的农场账号数量（额度） */
  defaultAccountLimit: readNumber('FARM_DEFAULT_ACCOUNT_LIMIT', 2),

  /** 管理员账号默认额度（-1 表示不限制） */
  adminAccountLimit: -1,

  /** 引导管理员：首次启动自动创建 */
  bootstrapAdminUsername: readEnv('FARM_ADMIN_USERNAME', 'admin'),
  bootstrapAdminPassword: readEnv('FARM_ADMIN_PASSWORD', 'admin123'),

  /**
   * 引导管理员是否拥有超级管理员权限。
   * 默认开启：否则会出现"没有任何账号能管理管理员"的权限死锁
   * （super_admin 只能通过环境变量额外配置，不配置就永远没人能改角色/管管理员）。
   * 已存在的引导管理员会在启动时自动升级为超级管理员。
   * 设为 false 则引导管理员仅为普通管理员（此时超管必须靠环境变量配置）。
   */
  bootstrapAdminAsSuper: readBoolean('FARM_BOOTSTRAP_ADMIN_AS_SUPER', true),

  /** 超级管理员：可选，配置后启用。超级管理员不可被普通管理员修改 */
  superAdminUsername: readEnv('FARM_SUPER_ADMIN_USERNAME', ''),
  superAdminPassword: readEnv('FARM_SUPER_ADMIN_PASSWORD', ''),

  /** 会话有效期（毫秒），0 表示不过期 */
  sessionTtlMs: readNumber('FARM_SESSION_TTL_MS', 7 * DAY_MS),

  /** 登录失败限制 */
  maxLoginAttempts: readNumber('FARM_MAX_LOGIN_ATTEMPTS', 5),
  lockoutMinutes: readNumber('FARM_LOCKOUT_MINUTES', 15),
  ipRateLimitWindowMs: readNumber('FARM_IP_RATE_WINDOW_MS', MINUTE_MS),
  ipMaxAttemptsPerWindow: readNumber('FARM_IP_MAX_ATTEMPTS', 10),
  ipLockoutMinutes: readNumber('FARM_IP_LOCKOUT_MINUTES', 10),

  /** 卡密代码格式：分组数与每组长度 */
  cardCodeGroups: readNumber('FARM_CARD_CODE_GROUPS', 4),
  cardCodeGroupLength: readNumber('FARM_CARD_CODE_GROUP_LENGTH', 4),

  /** 登录日志保留条数 */
  loginLogLimit: readNumber('FARM_LOGIN_LOG_LIMIT', 5000),

  /** 常量导出，供其他模块复用 */
  MINUTE_MS,
  HOUR_MS,
  DAY_MS,
};

/** 角色枚举 */
const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
};

/** 卡密类型枚举 */
const CARD_TYPES = {
  /** 加时卡：延长账号有效期 */
  TIME: 'time',
  /** 额度卡：增加可添加农场账号数量等配额 */
  QUOTA: 'quota',
};

/** 卡密状态枚举 */
const CARD_STATUS = {
  UNUSED: 'unused',
  USED: 'used',
  DISABLED: 'disabled',
  REVOKED: 'revoked',
};

/** 拥有管理权限的角色 */
function isElevatedRole(role) {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.SUPER_ADMIN;
}

module.exports = {
  USER_SYSTEM_CONFIG,
  USER_ROLES,
  CARD_TYPES,
  CARD_STATUS,
  isElevatedRole,
};
