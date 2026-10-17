/**
 * 管理面板端到端冒烟测试（真实 HTTP + 真实权限校验）
 * 运行：node --test test/admin-multi-user.test.js
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-admin-e2e-'));
process.env.FARM_DATA_DIR = tmpDir;
process.env.FARM_ADMIN_USERNAME = 'admin';
process.env.FARM_ADMIN_PASSWORD = 'Admin@12345';

/** 动态取一个空闲端口，避免与其它测试并发时冲突 */
function pickFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

let PORT = 0;
let BASE = '';

const store = require('../src/models/store');
const { CONFIG } = require('../src/config/config');

const server = null;

/** 只模拟挂机运行时，账号数据仍走真实 store */
function createMockProvider() {
  return {
    getAccounts: () => store.getAccounts(),
    getRunningAccountCount: () => 0,
    isAccountRunning: () => false,
    startAccount: async () => ({ ok: true }),
    stopAccount: async () => ({ ok: true }),
    restartAccount: async () => ({ ok: true }),
    addAccountLog: () => {},
    getAccountLogs: () => [],
    saveSettings: async () => ({}),
    saveAutoCodeRefresh: async () => ({}),
    getUI: () => ({}),
    setUITheme: async () => ({}),
    getSystemConfig: () => store.getSystemConfig(),
    setSystemConfig: () => ({}),
  };
}

async function api(pathname, { method = 'GET', body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-admin-token'] = token;
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  }
  catch {
    json = null;
  }
  return { status: res.status, body: json };
}

let adminToken = '';
let aliceToken = '';
let bobToken = '';
let aliceCard = '';

before(async () => {
  PORT = await pickFreePort();
  BASE = `http://127.0.0.1:${PORT}`;
  CONFIG.adminPort = PORT;
  const admin = require('../src/controllers/admin');
  admin.startAdminServer(createMockProvider());
  // 等待监听就绪
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    }
    catch {
      // 服务尚未监听，继续等待
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`管理面板未能在 ${BASE} 启动`);
});

after(() => {
  if (server)
    server.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  catch {}
  // admin.js 内部持有 http server，测试进程退出即可
  process.exit(0);
});

test('未带 token 访问受保护接口返回 401', async () => {
  const res = await api('/api/user/me');
  assert.equal(res.status, 401);
});

test('管理员登录成功', async () => {
  const res = await api('/api/login', {
    method: 'POST',
    body: { username: 'admin', password: 'Admin@12345' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.role, 'super_admin');
  adminToken = res.body.data.token;
});

test('密码错误返回 401', async () => {
  const res = await api('/api/login', {
    method: 'POST',
    body: { username: 'admin', password: 'wrong-password' },
  });
  assert.equal(res.status, 401);
});

test('多用户体系开启时 auto-login 被禁用', async () => {
  const res = await api('/api/auto-login', { method: 'POST', body: {} });
  assert.equal(res.status, 403);
});

test('管理员生成 3 天加时卡', async () => {
  const res = await api('/api/admin/cards', {
    method: 'POST',
    token: adminToken,
    body: { description: '3天体验卡', type: 'time', days: 3, count: 2, confirmed: true },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.length, 2);
  aliceCard = res.body.data[0].code;
});

test('普通用户不能使用管理员接口', async () => {
  const res = await api('/api/admin/cards', { token: 'invalid-token' });
  assert.equal(res.status, 401);
});

test('卡密预览返回面值', async () => {
  const res = await api(`/api/card/info/${aliceCard}`);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.type, 'time');
  assert.equal(res.body.data.durationValue, 3);
});

test('注册绑定 3 天卡并自动激活', async () => {
  const res = await api('/api/register', {
    method: 'POST',
    body: { username: 'alice', password: 'Alice@123', cardCode: aliceCard },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.accountLimit, 1);
  const expiresAt = res.body.data.subscription.expiresAt;
  assert.ok(expiresAt > Date.now() + 2.9 * 86400000);
});

test('同一张卡不能二次注册', async () => {
  const res = await api('/api/register', {
    method: 'POST',
    body: { username: 'bob', password: 'Bob@12345', cardCode: aliceCard },
  });
  assert.equal(res.status, 400);
});

test('普通用户登录成功且只能看到自己的额度', async () => {
  const res = await api('/api/login', {
    method: 'POST',
    body: { username: 'alice', password: 'Alice@123' },
  });
  assert.equal(res.body.ok, true, JSON.stringify(res.body));
  assert.equal(res.body.data.role, 'user');
  aliceToken = res.body.data.token;

  const me = await api('/api/user/me', { token: aliceToken });
  assert.equal(me.body.data.username, 'alice');
  assert.equal(me.body.data.accountLimit, 1);
  assert.equal(me.body.data.isExpired, false);
});

test('普通用户访问管理员接口被拒绝（403）', async () => {
  const res = await api('/api/admin/users', { token: aliceToken });
  assert.equal(res.status, 403);
});

test('普通用户可以添加农场账号并绑定归属', async () => {
  const res = await api('/api/accounts', {
    method: 'POST',
    token: aliceToken,
    body: { name: 'alice的农场', platform: 'qq', uin: '10001' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const created = res.body.data.accounts.at(-1);
  assert.equal(created.username, 'alice');
});

test('额度用尽后拒绝新增农场账号', async () => {
  // alice 默认额度 1，已有 1 个账号，再添加即被拒绝
  const res = await api('/api/accounts', {
    method: 'POST',
    token: aliceToken,
    body: { name: 'alice的农场2', platform: 'qq', uin: '10002' },
  });
  assert.equal(res.status, 403);
  assert.match(res.body.error, /额度/);
});

test('额度卡提升账号配额后可继续添加', async () => {
  const cardRes = await api('/api/admin/cards', {
    method: 'POST',
    token: adminToken,
    body: { description: '额度卡', type: 'quota', value: 3, count: 1, confirmed: true },
  });
  const quotaCode = cardRes.body.data[0].code;

  const renew = await api('/api/user/renew', {
    method: 'POST',
    token: aliceToken,
    body: { cardCode: quotaCode },
  });
  assert.equal(renew.body.ok, true, JSON.stringify(renew.body));
  assert.equal(renew.body.data.accountLimit, 4);
  assert.equal(renew.body.data.cardType, 'quota');

  const res = await api('/api/accounts', {
    method: 'POST',
    token: aliceToken,
    body: { name: 'alice的农场3', platform: 'qq', uin: '10003' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

test('所有登录用户可见全部账号，普通用户不能控制他人账号', async () => {
  // 管理员给 bob 开号并添加农场账号
  const bobCard = await api('/api/admin/cards', {
    method: 'POST',
    token: adminToken,
    body: { description: '7天卡', type: 'time', days: 7, count: 1, confirmed: true },
  });
  await api('/api/register', {
    method: 'POST',
    body: { username: 'bob', password: 'Bob@12345', cardCode: bobCard.body.data[0].code },
  });
  const bobLogin = await api('/api/login', {
    method: 'POST',
    body: { username: 'bob', password: 'Bob@12345' },
  });
  bobToken = bobLogin.body.data.token;
  await api('/api/accounts', {
    method: 'POST',
    token: bobToken,
    body: { name: 'bob的农场', platform: 'qq', uin: '20001' },
  });

  // 默认关闭「普通用户可见全部账号」：alice 只能看到自己的账号
  const list = await api('/api/accounts', { token: aliceToken });
  const listAccounts = list.body.data.accounts || [];
  const owners = new Set(listAccounts.map(item => item.username));
  assert.ok(owners.has('alice'), '仍能看到自己的账号');
  assert.ok(!owners.has('bob'), '默认关闭时普通用户看不到他人账号');
  assert.ok(listAccounts.every(item => item.owner));

  // 管理员开启开关后，普通用户可见全部账号（仅展示）
  const enable = await api('/api/admin/account-visibility', {
    method: 'POST', token: adminToken, body: { usersSeeAllAccounts: true },
  });
  assert.equal(enable.status, 200, JSON.stringify(enable.body));
  assert.equal(enable.body.data.usersSeeAllAccounts, true);
  const list2 = await api('/api/accounts', { token: aliceToken });
  const owners2 = new Set((list2.body.data.accounts || []).map(item => item.username));
  assert.ok(owners2.has('alice'));
  assert.ok(owners2.has('bob'), '开启开关后可见全部账号');

  // alice 不能操作 bob 的账号：删除、改名、编辑都被接口层拦下（id 从管理员视角获取）
  const adminList = await api('/api/accounts', { token: adminToken });
  const bobAccount = (adminList.body.data.accounts || []).find(item => item.username === 'bob');
  assert.ok(bobAccount, '管理员可见 bob 的账号');
  const del = await api(`/api/accounts/${bobAccount.id}`, { method: 'DELETE', token: aliceToken });
  assert.equal(del.status, 403);
  const remark = await api('/api/account/remark', {
    method: 'POST', token: aliceToken, body: { id: String(bobAccount.id), remark: '越权改名' },
  });
  assert.equal(remark.status, 403);
  const edit = await api('/api/accounts', {
    method: 'POST', token: aliceToken, body: { id: String(bobAccount.id), name: '越权改名' },
  });
  assert.equal(edit.status, 403);

  // 恢复关闭，避免影响后续用例
  const disable = await api('/api/admin/account-visibility', {
    method: 'POST', token: adminToken, body: { usersSeeAllAccounts: false },
  });
  assert.equal(disable.status, 200);
});

test('普通用户不能控制他人账号，提升为超级管理员后可以', async () => {
  // 创建 dave（普通用户）
  const created = await api('/api/admin/users', {
    method: 'POST',
    token: adminToken,
    body: { username: 'dave', password: 'Dave@12345', role: 'user' },
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const daveLogin = await api('/api/login', {
    method: 'POST',
    body: { username: 'dave', password: 'Dave@12345' },
  });
  const daveToken = daveLogin.body.data.token;

  // 默认关闭：普通用户看不到他人账号（越权尝试用的 id 从管理员视角获取）
  const daveList = await api('/api/accounts', { token: daveToken });
  const daveAccounts = daveList.body.data.accounts || [];
  assert.ok(!daveAccounts.some(item => item.username === 'bob'), '默认关闭时 dave 看不到 bob 的账号');
  const adminList = await api('/api/accounts', { token: adminToken });
  const bobAccount = (adminList.body.data.accounts || []).find(item => item.username === 'bob');
  assert.ok(bobAccount, '管理员可见 bob 的账号');

  // 但不能删除/编辑/改名他人账号
  const del = await api(`/api/accounts/${bobAccount.id}`, { method: 'DELETE', token: daveToken });
  assert.equal(del.status, 403);
  const edit = await api('/api/accounts', {
    method: 'POST', token: daveToken, body: { id: String(bobAccount.id), name: '越权改名' },
  });
  assert.equal(edit.status, 403);
  const remark = await api('/api/account/remark', {
    method: 'POST', token: daveToken, body: { id: String(bobAccount.id), remark: '越权改名' },
  });
  assert.equal(remark.status, 403);

  // 提升为超级管理员后不受归属限制（用备注接口验证，改回原名避免副作用）
  const promoted = await api('/api/admin/users/dave/edit', {
    method: 'POST',
    token: adminToken,
    body: { username: 'dave', role: 'super_admin' },
  });
  assert.equal(promoted.status, 200, JSON.stringify(promoted.body));
  assert.equal(promoted.body.data.role, 'super_admin');
  const superLogin = await api('/api/login', {
    method: 'POST',
    body: { username: 'dave', password: 'Dave@12345' },
  });
  // 提升为超级管理员后不受可见性开关限制，能看到全部账号
  const superList = await api('/api/accounts', { token: superLogin.body.data.token });
  assert.ok((superList.body.data.accounts || []).some(item => item.username === 'bob'), '超管可见全部账号');
  const superRemark = await api('/api/account/remark', {
    method: 'POST', token: superLogin.body.data.token, body: { id: String(bobAccount.id), remark: 'bob的农场' },
  });
  assert.equal(superRemark.status, 200, JSON.stringify(superRemark.body));

  // 收尾：先降级回普通用户再删除，避免影响后续用例
  await api('/api/admin/users/dave/edit', {
    method: 'POST',
    token: adminToken,
    body: { username: 'dave', role: 'user' },
  });
  const delUser = await api('/api/admin/users/dave', {
    method: 'DELETE',
    token: adminToken,
    body: { confirmed: true },
  });
  assert.equal(delUser.status, 200, JSON.stringify(delUser.body));
});

test('管理员可查看全部用户与名下账号配置', async () => {
  const users = await api('/api/admin/users', { token: adminToken });
  assert.equal(users.status, 200);
  const names = users.body.data.map(item => item.username).sort();
  assert.ok(names.includes('alice'));
  assert.ok(names.includes('bob'));
  assert.ok(names.includes('admin'));

  const detail = await api('/api/admin/users/alice/accounts?withConfig=1', { token: adminToken });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.total, 2);
  assert.ok(detail.body.data.accounts[0].config);
  assert.ok(detail.body.data.accounts[0].config.automation);
});

test('管理员编辑自己的资料不会被角色校验误拦截', async () => {
  // 回归：编辑表单每次都会携带 role 字段，早期版本会无条件要求超管而 403
  const res = await api('/api/admin/users/admin/edit', {
    method: 'POST',
    token: adminToken,
    body: { username: 'admin', role: 'super_admin', nick: '站长', accountLimit: -1 },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.nick, '站长');
  assert.equal(res.body.data.role, 'super_admin');
});

test('管理员不能修改自己的角色', async () => {
  const res = await api('/api/admin/users/admin/edit', {
    method: 'POST',
    token: adminToken,
    body: { username: 'admin', role: 'user' },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /不能修改自己的角色/);
  const me = await api('/api/user/me', { token: adminToken });
  assert.equal(me.body.data.role, 'super_admin');
});

test('超级管理员可以把普通用户提升为超级管理员', async () => {
  const created = await api('/api/admin/users', {
    method: 'POST',
    token: adminToken,
    body: { username: 'carol', password: 'Carol@12345', role: 'user', accountLimit: 2 },
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));

  const promoted = await api('/api/admin/users/carol/edit', {
    method: 'POST',
    token: adminToken,
    body: { username: 'carol', role: 'super_admin' },
  });
  assert.equal(promoted.status, 200, JSON.stringify(promoted.body));
  assert.equal(promoted.body.data.role, 'super_admin');
  assert.equal(promoted.body.data.accountLimit, -1);

  // 收尾：先降级回普通用户再删除，避免影响后续用例
  await api('/api/admin/users/carol/edit', {
    method: 'POST',
    token: adminToken,
    body: { username: 'carol', role: 'user' },
  });
  const del = await api('/api/admin/users/carol', {
    method: 'DELETE',
    token: adminToken,
    body: { confirmed: true },
  });
  assert.equal(del.status, 200, JSON.stringify(del.body));
});

test('管理员代用户核销加时卡会顺延有效期', async () => {
  const before = await api('/api/admin/users', { token: adminToken });
  const aliceBefore = before.body.data.find(item => item.username === 'alice');

  const cardRes = await api('/api/admin/cards', {
    method: 'POST',
    token: adminToken,
    body: { description: '10天加时卡', type: 'time', days: 10, count: 1, confirmed: true },
  });
  const renew = await api('/api/admin/users/alice/renew', {
    method: 'POST',
    token: adminToken,
    body: { cardCode: cardRes.body.data[0].code, confirmed: true },
  });
  assert.equal(renew.body.ok, true, JSON.stringify(renew.body));

  const after = await api('/api/admin/users', { token: adminToken });
  const aliceAfter = after.body.data.find(item => item.username === 'alice');
  const delta = aliceAfter.subscription.expiresAt - aliceBefore.subscription.expiresAt;
  assert.ok(Math.abs(delta - 10 * 86400000) < 5000, `顺延异常 ${delta}`);
});

test('管理员将用户置为过期后其 token 立即失效', async () => {
  const past = Date.now() - 1000;
  const res = await api('/api/admin/users/bob', {
    method: 'POST',
    token: adminToken,
    body: { expiresAt: past, confirmed: true },
  });
  assert.equal(res.body.ok, true, JSON.stringify(res.body));

  const me = await api('/api/user/me', { token: bobToken });
  assert.equal(me.status, 403);
  assert.match(me.body.error, /过期/);
});

test('过期用户重新登录被拒绝', async () => {
  const res = await api('/api/login', {
    method: 'POST',
    body: { username: 'bob', password: 'Bob@12345' },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.errorType, 'expired');
});

test('卡密作废后不可核销', async () => {
  const cardRes = await api('/api/admin/cards', {
    method: 'POST',
    token: adminToken,
    body: { description: '待作废卡', type: 'time', days: 1, count: 1, confirmed: true },
  });
  const code = cardRes.body.data[0].code;
  const revoke = await api(`/api/admin/cards/${code}`, {
    method: 'POST',
    token: adminToken,
    body: { revoked: true, confirmed: true },
  });
  assert.equal(revoke.body.data.revoked, true);

  const renew = await api('/api/user/renew', {
    method: 'POST',
    token: aliceToken,
    body: { cardCode: code },
  });
  assert.equal(renew.status, 400);
  assert.match(renew.body.error, /作废/);
});

test('危险操作未确认时返回 400 并提示确认标识', async () => {
  const res = await api('/api/admin/cards', {
    method: 'POST',
    token: adminToken,
    body: { description: '未确认', type: 'time', days: 1 },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.requiredConfirmation, 'CREATE_CARD');
});

test('核销流水记录完整', async () => {
  const res = await api('/api/admin/card-redemptions', { token: adminToken });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.total >= 5);
  const actions = new Set(res.body.data.redemptions.map(item => item.action));
  assert.ok(actions.has('register'));
  assert.ok(actions.has('redeem'));
  assert.ok(actions.has('revoke'));
});

test('登录日志已记录', async () => {
  const res = await api('/api/admin/login-logs', { token: adminToken });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.total > 0);
  const events = new Set(res.body.data.logs.map(item => item.event));
  assert.ok(events.has('login_success'));
  assert.ok(events.has('login_failed'));
});

test('普通用户可读写系统配置（公开端点），管理员端点仍拒绝', async () => {
  const pub = await api('/api/system-config', { token: aliceToken });
  assert.equal(pub.status, 200);
  assert.ok(pub.body.data.default.clientVersion, '应返回默认版本号');

  // 普通用户可经公开端点修改系统配置（管理后台的管理端点仍拒绝）
  const before = pub.body.data.saved || pub.body.data.default;
  const write = await api('/api/system-config', {
    method: 'POST',
    token: aliceToken,
    body: { ...before, platform: 'wx', confirmed: true },
  });
  assert.equal(write.status, 200, JSON.stringify(write.body));
  assert.equal(write.body.data.saved.platform, 'wx');
  // 还原，避免影响其他用例
  const restore = await api('/api/system-config', {
    method: 'POST',
    token: aliceToken,
    body: { ...before, confirmed: true },
  });
  assert.equal(restore.status, 200, JSON.stringify(restore.body));

  const denied = await api('/api/admin/system-config', { token: aliceToken });
  assert.equal(denied.status, 403);
});

test('默认版本号快捷设置：格式校验 + 只改版本号其它字段保留', async () => {
  const bad = await api('/api/admin/default-version', {
    method: 'POST', token: adminToken, body: { clientVersion: 'abc', confirmed: true },
  });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /格式/);

  const noConfirm = await api('/api/admin/default-version', {
    method: 'POST', token: adminToken, body: { clientVersion: '1.15.0.2_20261001' },
  });
  assert.equal(noConfirm.status, 400);
  assert.equal(noConfirm.body.requiredConfirmation, 'UPDATE_SYSTEM_CONFIG');

  const before = await api('/api/admin/system-config', { token: adminToken });
  const prev = before.body.data.saved || before.body.data.default;
  const okRes = await api('/api/admin/default-version', {
    method: 'POST', token: adminToken, body: { clientVersion: '9.9.9.9_20261231', confirmed: true },
  });
  assert.equal(okRes.status, 200, JSON.stringify(okRes.body));
  assert.equal(okRes.body.data.saved.clientVersion, '9.9.9.9_20261231');
  assert.equal(okRes.body.data.saved.serverUrl, prev.serverUrl, '只改版本号不应影响服务器地址');

  // 还原，避免影响其他用例
  await api('/api/admin/default-version', {
    method: 'POST',
    token: adminToken,
    body: { clientVersion: prev.clientVersion || '1.15.0.2_20261001', confirmed: true },
  });
});

test('退出登录后 token 失效', async () => {
  await api('/api/logout', { method: 'POST', token: bobToken });
  const res = await api('/api/user/me', { token: bobToken });
  assert.equal(res.status, 401);
});
