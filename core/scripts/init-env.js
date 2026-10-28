#!/usr/bin/env node
/**
 * 首次启动时生成配置文件（Windows 的 start.bat 会调用它；Linux 用 start.sh 自带逻辑）
 *
 * 作用与 start.sh 里的 prepare_env / print_admin_credentials 保持一致：
 *   1. 没有 .env 时生成一份，并随机生成管理员初始密码；
 *   2. 把管理员账号密码打印在控制台（这是用户唯一能记住它的地方）；
 *   3. 若 users.json 里已存在同名管理员，提醒「本次生成的新密码不生效，旧密码仍有效」。
 *
 * 用法：node core/scripts/init-env.js
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const appDir = path.resolve(__dirname, '..', '..');
const envPath = path.join(appDir, '.env');
const userCandidates = [
  path.join(appDir, 'core', 'data', 'users.json'),
  path.join(appDir, 'data', 'users.json'),
];

const C = {
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  cyan: '\x1B[36m',
  off: '\x1B[0m',
};

/** 生成 16 位随机密码（去掉容易看错的 0/O/1/l/I 等字符） */
function randomPassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function readEnvValue(text, key) {
  const matched = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return matched ? matched[1].trim() : '';
}

function findExistingUsersFile(username) {
  for (const file of userCandidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const users = Array.isArray(data) ? data : (data && data.users) || [];
      if (users.some(user => user && user.username === username)) return file;
    } catch {
      // 数据文件还没成形时忽略，交给服务端自己初始化
    }
  }
  return '';
}

const existingEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const adminName = (existingEnv && readEnvValue(existingEnv, 'FARM_ADMIN_USERNAME'))
  || process.env.FARM_ADMIN_USERNAME
  || 'admin';

if (existingEnv) {
  const existingPassword = readEnvValue(existingEnv, 'FARM_ADMIN_PASSWORD');
  console.log(`${C.cyan}[INFO]${C.off} 已存在 .env，保留现有配置（不会重新生成密码）`);
  console.log(`${C.cyan}[INFO]${C.off} 管理后台账号：${adminName}`);
  if (existingPassword) {
    console.log(`${C.cyan}[INFO]${C.off} 管理后台密码：看项目根目录 .env 的 FARM_ADMIN_PASSWORD 这一行（当前已设置）`);
  } else {
    console.log(`${C.yellow}[WARN]${C.off} .env 里没有 FARM_ADMIN_PASSWORD，服务会使用内置默认口令 admin123，请尽快改成强密码`);
  }
  process.exit(0);
}

const initialPassword = randomPassword();
const now = new Date().toLocaleString('zh-CN', { hour12: false });
const envContent = `# 由 core/scripts/init-env.js 自动生成于 ${now}
# 修改后需重启服务生效

# ---- 多用户账号与卡密体系 ----
FARM_USER_SYSTEM_ENABLED=true
FARM_ADMIN_USERNAME=${adminName}
FARM_ADMIN_PASSWORD=${initialPassword}
FARM_ALLOW_REGISTER=true
FARM_ALLOW_PUBLIC_RENEW=true
FARM_ALLOW_PUBLIC_RESET_PASSWORD=true
FARM_DEFAULT_ACCOUNT_LIMIT=1
# 内置管理员默认拥有超级管理员权限；关闭后必须另行配置超管
FARM_BOOTSTRAP_ADMIN_AS_SUPER=true
# 超级管理员（可选，取消注释并填写后启用，权限高于普通管理员）
# FARM_SUPER_ADMIN_USERNAME=superadmin
# FARM_SUPER_ADMIN_PASSWORD=ChangeMe@2026

# ---- Docker 构建依赖用的 npm 镜像源（仅 Docker 方式启动时用到）----
# 构建时如果提示所有镜像源都装不上 pnpm，取消注释并改成你那边能访问的源即可
# NPM_REGISTRY=https://registry.npmmirror.com
# NPM_REGISTRY_FALLBACK=https://registry.npmjs.org

# ---- NapCat（QQ 扫码登录，Windows 默认版不使用）----
NAPCAT_LOGIN_ENABLED=false
NAPCAT_DEVICE_NAME=qq-farm-bot
`;

fs.writeFileSync(envPath, envContent, 'utf8');
console.log(`${C.green}[ OK ]${C.off} 已生成 .env（项目根目录）`);

const usersFile = findExistingUsersFile(adminName);
if (usersFile) {
  console.log('');
  console.log(`${C.yellow}================ 注意 ================${C.off}`);
  console.log(`检测到已存在的管理员账号 ${adminName}（${usersFile}）`);
  console.log('本次生成的初始密码【不会】生效，请使用旧密码登录。');
  console.log('忘记旧密码时，重置后重启服务：');
  console.log('  cd core');
  console.log('  node scripts/reset-admin-password.js 新密码');
  console.log(`${C.yellow}======================================${C.off}`);
  process.exit(0);
}

console.log('');
console.log(`${C.green}================ 初始管理员账号 ================${C.off}`);
console.log(`  用户名: ${C.green}${adminName}${C.off}`);
console.log(`  密  码: ${C.green}${initialPassword}${C.off}`);
console.log(`  配置文件: ${envPath}`);
console.log(`${C.green}================================================${C.off}`);
console.log(`${C.yellow}密码已写入项目根目录的 .env（FARM_ADMIN_PASSWORD），请登录后立即修改！${C.off}`);