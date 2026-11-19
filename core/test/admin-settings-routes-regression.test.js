const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAdminSettingsRoutes } = require('../src/controllers/admin-settings-routes');

function fixture({ provider = {}, store = {} } = {}) {
  const routes = {};
  const app = {
    get: (path, handler) => { routes[`get ${path}`] = handler; },
    post: (path, handler) => { routes[`post ${path}`] = handler; },
    put: (path, handler) => { routes[`put ${path}`] = handler; },
  };
  registerAdminSettingsRoutes({
    app,
    provider,
    store,
    logger: {},
    getAccountIdFromRequest: req => req.accountId,
    canAccessAccount: (req, id) => req.allowed === true && id === 'account-1',
    requireDangerConfirmation: () => true,
  });
  return {
    async invoke(method, path, req = {}) {
      const res = {
        code: 200,
        status(value) { this.code = value; return this; },
        json(value) { this.body = value; return this; },
      };
      await routes[`${method} ${path}`](req, res);
      return res;
    },
  };
}

test('default-plan apply does not call saveSettings again and syncs workers and refresh timer', async () => {
  const calls = [];
  const f = fixture({
    provider: {
      saveSettings: (...args) => calls.push(['saveSettings', ...args]),
      syncAccountConfig: (...args) => calls.push(['syncAccountConfig', ...args]),
      broadcastConfig: (...args) => calls.push(['broadcastConfig', ...args]),
    },
    store: {
      applyUserDefaultAccountPlan: (...args) => { calls.push(['apply', ...args]); return { plantingStrategy: 'level' }; },
    },
  });

  const response = await f.invoke('post', '/api/settings/default-plan/apply', {
    accountId: 'account-1', allowed: true, currentUser: { username: 'alice' },
  });

  assert.equal(response.body.ok, true);
  assert.deepEqual(calls, [
    ['apply', 'alice', 'account-1'],
    ['syncAccountConfig', 'account-1', { rescheduleAutoCodeRefresh: true }],
  ]);
});

test('manual refresh reports provider ok:false as a failed response', async () => {
  const f = fixture({
    provider: { refreshAccountCode: async () => ({ ok: false, error: 'provider detail' }) },
  });

  const response = await f.invoke('post', '/api/settings/auto-code-refresh/run', {
    accountId: 'account-1', allowed: true,
  });

  assert.equal(response.code, 200);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /刷新 Code 失败/);
});
