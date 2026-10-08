/**
 * 重置指定用户的密码（管理员应急工具）
 *
 * 用法：
 *   node scripts/reset-admin-password.js <新密码> [用户名]
 *
 * 不传用户名时，重置 .env / 默认配置中的内置管理员（FARM_ADMIN_USERNAME，默认 admin）。
 * 若用户不存在，会直接创建该用户为管理员并设为永久有效。
 *
 * 注意：执行前请先停止服务，避免内存中的会话覆盖写入。
 */
const path = require('node:path');

const newPassword = String(process.argv[2] || '').trim();
const target = String(process.argv[3] || '').trim();

if (!newPassword) {
  console.error('用法: node scripts/reset-admin-password.js <新密码> [用户名]');
  process.exit(1);
}

const userStore = require('../src/models/user-store');
const { USER_SYSTEM_CONFIG } = require('../src/config/user-system');

const username = target || String(USER_SYSTEM_CONFIG.bootstrapAdminUsername || 'admin').trim();

const existing = userStore.getUserByName(username);
const result = existing
  ? userStore.editUser(username, { password: newPassword })
  : userStore.createUserByAdmin({
    username,
    password: newPassword,
    role: USER_SYSTEM_CONFIG.bootstrapAdminAsSuper === false ? 'admin' : 'super_admin',
    isPermanent: true,
    nick: '管理员',
    remark: '由 reset-admin-password 创建',
    operator: 'cli',
  });

if (!result || result.ok === false) {
  console.error('重置失败:', (result && result.error) || '未知错误');
  process.exit(1);
}

console.log('');
console.log('== 密码已重置 ==');
console.log(`  用户名: ${username}`);
console.log(`  密  码: ${newPassword}`);
console.log(`  角  色: ${result.user.role}`);
console.log(`  数据文件: ${path.join(require('../src/config/runtime-paths').getDataDir(), 'users.json')}`);
console.log('');
console.log('请重启服务后使用该密码登录，并尽快在面板中再次修改。');
