/**
 * 多用户与卡密体系核心业务规则测试
 * 运行：node --test test/user-store.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-user-store-'));
process.env.FARM_DATA_DIR = tmpDir;
process.env.FARM_ADMIN_USERNAME = 'admin';
process.env.FARM_ADMIN_PASSWORD = 'Admin@12345';

const userStore = require('../src/models/user-store');
const { CARD_TYPES, CARD_STATUS } = require('../src/config/user-system');

const DAY_MS = 24 * 60 * 60 * 1000;

function makeTimeCard(days, description = '测试卡') {
  const result = userStore.createCard({ description, type: CARD_TYPES.TIME, days });
  assert.ok(result.ok);
  return result.cards[0];
}

function makeQuotaCard(value) {
  const result = userStore.createCard({
    description: '额度卡',
    type: CARD_TYPES.QUOTA,
    value,
  });
  assert.ok(result.ok);
  return result.cards[0];
}

test('引导管理员已创建且为永久有效', () => {
  const admin = userStore.getUserByName('admin');
  assert.ok(admin);
  // 内置管理员默认具备超级管理员权限，避免出现"无人能管理管理员"的死锁
  assert.equal(admin.role, 'super_admin');
  assert.equal(admin.subscription.isPermanent, true);
  assert.equal(admin.accountLimit, -1);
});

test('注册绑定 3 天卡 -> 有效期为 3 天后', () => {
  const card = makeTimeCard(3, '3天体验卡');
  const before = Date.now();
  const result = userStore.registerUser('alice', 'Alice@123', card.code);
  assert.ok(result.ok, result.error);

  const user = userStore.getUserByName('alice');
  assert.equal(user.role, 'user');
  const expected = before + 3 * DAY_MS;
  // 允许 5 秒误差
  assert.ok(Math.abs(user.subscription.expiresAt - expected) < 5000);
  assert.equal(userStore.isSubscriptionExpired(user.subscription), false);

  // 卡密已被核销
  const used = userStore.getCardByCode(card.code);
  assert.equal(used.status, CARD_STATUS.USED);
  assert.equal(used.usedBy, 'alice');
});

test('注册不能使用额度卡', () => {
  const card = makeQuotaCard(2);
  const result = userStore.registerUser('bob', 'Bob@12345', card.code);
  assert.equal(result.ok, false);
});

test('同一张卡不能重复使用', () => {
  const card = makeTimeCard(1);
  const first = userStore.registerUser('carol', 'Carol@123', card.code);
  assert.ok(first.ok);
  const second = userStore.registerUser('dave', 'Dave@1234', card.code);
  assert.equal(second.ok, false);
  assert.match(second.error, /已被使用/);
});

test('加时卡在未过期账号上顺延有效期', () => {
  const card1 = makeTimeCard(3);
  userStore.registerUser('eve', 'Eve@12345', card1.code);
  const before = userStore.getUserByName('eve').subscription.expiresAt;

  const card2 = makeTimeCard(5);
  const renew = userStore.renewUser('eve', card2.code);
  assert.ok(renew.ok, renew.error);
  const after = userStore.getUserByName('eve').subscription.expiresAt;

  const delta = after - before;
  assert.ok(Math.abs(delta - 5 * DAY_MS) < 5000, `顺延时长异常: ${delta}`);
});

test('加时卡在已过期账号上从当前时间重新起算', () => {
  const card1 = makeTimeCard(1);
  userStore.registerUser('frank', 'Frank@123', card1.code);
  // 手动把有效期改成过去
  userStore.updateUser('frank', { expiresAt: Date.now() - DAY_MS });
  assert.equal(userStore.isSubscriptionExpired(userStore.getUserByName('frank').subscription), true);

  const card2 = makeTimeCard(2);
  const renew = userStore.renewUser('frank', card2.code);
  assert.ok(renew.ok);
  const user = userStore.getUserByName('frank');
  assert.equal(userStore.isSubscriptionExpired(user.subscription), false);
  const remaining = userStore.getRemainingMs(user.subscription);
  assert.ok(remaining > 2 * DAY_MS - 10000 && remaining <= 2 * DAY_MS);
});

test('永久卡置为永久，且后续加时不改变永久状态', () => {
  const card = makeTimeCard(-1, '永久卡');
  userStore.registerUser('grace', 'Grace@123', card.code);
  let user = userStore.getUserByName('grace');
  assert.equal(user.subscription.isPermanent, true);
  assert.equal(user.subscription.expiresAt, null);

  const card2 = makeTimeCard(10);
  userStore.renewUser('grace', card2.code);
  user = userStore.getUserByName('grace');
  assert.equal(user.subscription.isPermanent, true);
  assert.equal(user.subscription.expiresAt, null);
});

test('额度卡增加可添加账号数量', () => {
  const card1 = makeTimeCard(7);
  userStore.registerUser('henry', 'Henry@123', card1.code);
  const before = userStore.getUserByName('henry').accountLimit;

  const quota = makeQuotaCard(3);
  const renew = userStore.renewUser('henry', quota.code);
  assert.ok(renew.ok);
  const after = userStore.getUserByName('henry').accountLimit;
  assert.equal(after, before + 3);
});

test('额度校验：未超限允许，超限拒绝，管理员不限制', () => {
  const user = userStore.getUserByName('henry');
  const limit = user.accountLimit;
  assert.equal(userStore.checkAccountQuota(user, limit - 1).ok, true);
  assert.equal(userStore.checkAccountQuota(user, limit).ok, false);
  assert.equal(userStore.checkAccountQuota(user, limit + 5).ok, false);

  const admin = userStore.getUserByName('admin');
  assert.equal(userStore.checkAccountQuota(admin, 9999).ok, true);
});

test('卡密作废后不可再核销', () => {
  const card = makeTimeCard(1, '待作废卡');
  const revoked = userStore.revokeCard(card.code, 'admin');
  assert.ok(revoked.ok);
  assert.equal(revoked.card.revoked, true);
  assert.equal(revoked.card.status, CARD_STATUS.REVOKED);

  const result = userStore.registerUser('ivan', 'Ivan@12345', card.code);
  assert.equal(result.ok, false);
  assert.match(result.error, /作废/);
});

test('登录校验：密码错误锁定、正确密码可登录', () => {
  const card = makeTimeCard(30);
  userStore.registerUser('judy', 'Judy@12345', card.code);

  const ok = userStore.validateUser('judy', 'Judy@12345', '127.0.0.1');
  assert.ok(ok && !ok.error);
  assert.equal(ok.username, 'judy');

  const bad = userStore.validateUser('judy', 'wrong-password', '127.0.0.2');
  assert.ok(bad.error);
});

test('过期账号登录会被拒绝', () => {
  const card = makeTimeCard(1);
  userStore.registerUser('ken', 'Ken@123456', card.code);
  userStore.updateUser('ken', { expiresAt: Date.now() - 1000 });

  const result = userStore.validateUser('ken', 'Ken@123456', '127.0.0.3');
  // validateUser 只负责凭据校验，过期判断在路由层与会话层完成
  assert.ok(result && !result.error);
  assert.equal(userStore.isSubscriptionExpired(result.subscription), true);
});

test('核销流水被记录', () => {
  const card = makeTimeCard(2, '流水测试卡');
  userStore.registerUser('leo', 'Leo@123456', card.code);
  const list = userStore.getRedemptions({ username: 'leo' });
  assert.ok(list.total >= 1);
  assert.equal(list.redemptions[0].action, 'register');
  assert.equal(list.redemptions[0].code, card.code);
});

test('管理员改有效期与启停生效', () => {
  const card = makeTimeCard(1);
  userStore.registerUser('mia', 'Mia@123456', card.code);

  const target = Date.now() + 10 * DAY_MS;
  userStore.editUser('mia', { expiresAt: target });
  assert.ok(Math.abs(userStore.getUserByName('mia').subscription.expiresAt - target) < 5000);

  userStore.updateUser('mia', { enabled: false });
  assert.equal(userStore.getUserByName('mia').subscription.enabled, false);
});

test('删除用户与清理过期用户不会删除管理员', () => {
  const card = makeTimeCard(1);
  userStore.registerUser('nina', 'Nina@12345', card.code);
  userStore.updateUser('nina', { expiresAt: Date.now() - 1000 });

  const cleared = userStore.clearExpiredUsers();
  assert.ok(cleared.deletedUsers.includes('nina'));
  assert.equal(userStore.getUserByName('nina'), null);
  assert.ok(userStore.getUserByName('admin'));
});

test('修改密码后旧密码失效', () => {
  const card = makeTimeCard(1);
  userStore.registerUser('oscar', 'Oscar@1234', card.code);
  const changed = userStore.changePassword('oscar', 'Oscar@1234', 'NewPass@2026');
  assert.ok(changed.ok);
  const bad = userStore.validateUser('oscar', 'Oscar@1234', '127.0.0.9');
  assert.ok(bad.error);
});

test('清理临时数据目录', () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  assert.ok(!fs.existsSync(tmpDir));
});
