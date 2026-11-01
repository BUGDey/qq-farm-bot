const test = require('node:test');
const assert = require('node:assert/strict');

// 拦截真实发信：只看调用参数，不发网络请求
const pushPath = require.resolve('../src/services/push');
const sent = [];
require.cache[pushPath] = {
  id: pushPath,
  filename: pushPath,
  loaded: true,
  exports: {
    sendSmtpEmail: async (options) => {
      sent.push(options);
      return { ok: true, msg: 'stub' };
    },
    sendPushooMessage: async () => ({ ok: true }),
  },
};

const { registerAdminMailerRoutes } = require('../src/controllers/admin-mailer-routes');

function createApp() {
  const routes = [];
  const push = (method) => (path, ...handlers) => {
    routes.push({ method, path, handlers, handler: handlers[handlers.length - 1] });
  };
  return {
    get: push('get'),
    post: push('post'),
    find(method, path) {
      const route = routes.find(r => r.method === method && r.path === path);
      assert.ok(route, `route ${method} ${path} not registered`);
      return route.handler;
    },
    findAll(method, path) {
      const route = routes.find(r => r.method === method && r.path === path);
      assert.ok(route, `route ${method} ${path} not registered`);
      return route.handlers;
    },
    all() { return routes; },
  };
}

function createRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

function setup({ includeExpired } = {}) {
  const users = [
    { username: 'alice', role: 'user', isExpired: false, email: 'alice@example.com' },
    { username: 'bob', role: 'user', isExpired: true, email: 'bob@example.com' },
    { username: 'carol', role: 'user', isExpired: false, email: '' },
  ];
  const reminders = {
    alice: { recipientEmail: 'alice-notify@example.com' },
    bob: { recipientEmail: 'bob@example.com' },
    carol: { recipientEmail: '' },
  };
  const store = {
    getGlobalMailer: () => ({
      enabled: true,
      ready: true,
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpUser: 'bot@example.com',
      smtpPass: 'secret',
      senderName: '农场助手',
      subject: '默认主题',
      content: '',
    }),
    setGlobalMailer: (patch) => ({ ready: true, ...patch }),
    getOfflineReminder: (name) => reminders[name] || {},
  };
  const userStore = {
    listUsersForAdmin: () => users,
    getAllUsers: () => users,
  };
  const app = createApp();
  registerAdminMailerRoutes({
    app,
    store,
    userStore,
    // 真实的 requireAdminRole 是 express 中间件，靠 next() 放行
    requireAdminRole: (req, res, next) => next(),
    sendProviderError: (res, error) => res.status(500).json({ ok: false, error: error.message }),
  });
  return { app, includeExpired };
}

test('bulk send skips expired users by default', async () => {
  sent.length = 0;
  const { app } = setup();
  const handler = app.find('post', '/api/admin/mail/send');
  const res = createRes();
  await handler(
    { body: { usernames: ['alice', 'bob', 'carol'], subject: '维护通知', content: '今晚 23 点维护' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.sent, 1);
  assert.equal(res.body.data.skipped.length, 2);
  const skipped = res.body.data.skipped.map(item => item.username).sort();
  assert.deepEqual(skipped, ['bob', 'carol']);
  assert.equal(sent.length, 1);
  // 收件地址优先取通知设置里的收件邮箱
  assert.equal(sent[0].recipientEmail, 'alice-notify@example.com');
  assert.equal(sent[0].smtpHost, 'smtp.example.com');
  assert.equal(sent[0].subject, '维护通知');
});

test('bulk send includes expired users when requested', async () => {
  sent.length = 0;
  const { app } = setup();
  const handler = app.find('post', '/api/admin/mail/send');
  const res = createRes();
  await handler(
    { body: { usernames: ['alice', 'bob'], subject: '续费提醒', content: '你的订阅已过期', includeExpired: true } },
    res,
  );
  assert.equal(res.body.data.sent, 2);
  assert.deepEqual(sent.map(item => item.recipientEmail).sort(), ['alice-notify@example.com', 'bob@example.com']);
});

test('bulk send rejects empty selection and empty content', async () => {
  const { app } = setup();
  const handler = app.find('post', '/api/admin/mail/send');
  const emptySel = createRes();
  await handler({ body: { usernames: [], subject: 'x', content: 'y' } }, emptySel);
  assert.equal(emptySel.statusCode, 400);

  const emptyContent = createRes();
  await handler({ body: { usernames: ['alice'], subject: 'x', content: '' } }, emptyContent);
  assert.equal(emptyContent.statusCode, 400);
});

test('recipient list exposes email source and expiry', () => {
  const { app } = setup();
  const handler = app.find('get', '/api/admin/mail-recipients');
  const res = createRes();
  handler({}, res);
  assert.equal(res.statusCode, 200);
  const byName = Object.fromEntries(res.body.data.map(item => [item.username, item]));
  assert.equal(byName.alice.email, 'alice-notify@example.com');
  assert.equal(byName.alice.emailSource, 'reminder');
  assert.equal(byName.bob.isExpired, true);
  assert.equal(byName.carol.email, '');
});

// 回归：曾经把 requireAdminRole(req, res) 当普通函数调用，
// 它内部会执行 next() → 抛 "next is not a function"，管理后台报 500。
test('mailer routes mount requireAdminRole as express middleware', async () => {
  const middleware = (req, res, next) => {
    if (!req.currentUser || req.currentUser.role !== 'super_admin') {
      res.status(403).json({ ok: false, error: '需要超级管理员权限' });
      return;
    }
    next();
  };
  const app = createApp();
  registerAdminMailerRoutes({
    app,
    store: { getGlobalMailer: () => ({ enabled: false, ready: false }) },
    userStore: { getAllUsers: () => [] },
    requireAdminRole: middleware,
    sendProviderError: (res, error) => res.status(500).json({ ok: false, error: error.message }),
  });

  for (const route of app.all()) {
    assert.equal(route.handlers.length, 2, `${route.method} ${route.path} 应挂载中间件`);
    assert.equal(typeof route.handlers[0], 'function');
  }

  // 超级管理员：中间件放行，处理函数正常执行，不再抛 next is not a function
  const handlers = app.findAll('get', '/api/admin/mailer');
  const okRes = createRes();
  let passed = false;
  handlers[0]({ currentUser: { role: 'super_admin' } }, okRes, () => { passed = true; });
  assert.equal(passed, true);
  handlers[1]({ currentUser: { role: 'super_admin' } }, okRes);
  assert.equal(okRes.statusCode, 200);
  assert.equal(okRes.body.ok, true);

  // 普通用户：中间件直接 403，处理函数不会执行
  const deniedRes = createRes();
  const denied = app.findAll('get', '/api/admin/mailer')[0];
  denied({ currentUser: { role: 'user' } }, deniedRes, () => {
    throw new Error('普通用户不应该通过 requireAdminRole');
  });
  assert.equal(deniedRes.statusCode, 403);
});
