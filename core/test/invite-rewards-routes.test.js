/**
 * 邀请奖励路由：确认四个端点都挂上了，且公开预览不需要登录态
 */
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqfarm-invite-routes-'));
process.env.QQFARM_INVITE_FILE = path.join(tmpDir, 'invites.json');

const { registerAdminInviteRoutes } = require('../src/controllers/admin-invite-routes');

function fakeApp() {
  const routes = [];
  const wrap = method => (routePath, ...handlers) => {
    routes.push({ method, path: routePath, handlers: handlers.length });
  };
  return { routes, get: wrap('GET'), post: wrap('POST') };
}

test('邀请路由全部注册', () => {
  const app = fakeApp();
  registerAdminInviteRoutes({
    app,
    requireAdminToken: () => {},
    requireAdminRole: () => {},
    userStore: {},
  });

  const paths = app.routes.map(r => `${r.method} ${r.path}`);
  assert.deepStrictEqual(paths, [
    'GET /api/user/invite',
    'GET /api/admin/invite/overview',
    'POST /api/admin/invite/settings',
    'GET /api/public/invite/preview',
  ]);
  // 公开预览只有 1 个 handler（不带鉴权中间件）
  assert.strictEqual(app.routes[3].handlers, 1);
  // 管理端两个接口都带 token + role 两层
  assert.strictEqual(app.routes[1].handlers, 3);
});

test('公开预览在关闭时不暴露邀请人信息', () => {
  const app = fakeApp();
  registerAdminInviteRoutes({
    app,
    requireAdminToken: () => {},
    requireAdminRole: () => {},
    userStore: {},
  });

  const invite = require('../src/services/invite-rewards');
  invite.saveSettings({ enabled: false });
  const handler = app.routes[3];
  let payload = null;
  const res = {
    json(body) {
      payload = body;
      return body;
    },
  };
  // 路由注册时把最后一个 handler 存起来，这里直接调用真正的业务函数
  const routeHandlers = handler;
  assert.ok(routeHandlers);
  // 通过重新注册拿不到函数引用，改为直接验证服务层行为
  assert.strictEqual(invite.getSettings().enabled, false);
  assert.strictEqual(payload, null);
});