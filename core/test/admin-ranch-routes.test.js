const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAdminRanchRoutes } = require('../src/controllers/admin-ranch-routes');
function fixture() {
    const routes = {}; const writes = []; const calls = [];
    let automation = {};
    const app = { get: (path, fn) => { routes[`get ${path}`] = fn; }, post: (path, fn) => { routes[`post ${path}`] = fn; } };
    registerAdminRanchRoutes({ app,
        provider: { getRanchStatus: async id => { calls.push(id); return { sceneReady: false }; }, broadcastConfigToWorkers: id => calls.push(`broadcast:${id}`) },
        store: { getAutomation: () => automation, applyConfigSnapshot: (patch, options) => { writes.push(options.accountId); automation = { ...automation, ...patch.automation }; } },
        getAccountIdFromRequest: req => req.id, canAccessAccount: req => req.allowed,
        sendProviderError: (res, err) => res.status(400).json({ ok: false, error: err.message }),
    });
    async function invoke(method, path, req) {
        const res = { code: 200, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
        await routes[`${method} ${path}`](req, res); return res;
    }
    return { invoke, writes, calls };
}
test('all ranch routes enforce account ownership before worker or storage access', async () => {
    const f = fixture();
    assert.equal((await f.invoke('get', '/api/ranch/status', { allowed: true })).code, 400);
    assert.equal((await f.invoke('get', '/api/ranch/status', { id: 'other', allowed: false })).code, 403);
    assert.equal((await f.invoke('post', '/api/ranch/settings', { id: 'other', allowed: false, body: { autoCollect: true } })).code, 403);
    assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
});
test('ranch settings work offline, reject unrecognized/nonboolean values, and broadcast only own patch', async () => {
    const f = fixture(); const req = { id: 'mine', allowed: true };
    const defaults = await f.invoke('get', '/api/ranch/settings', req);
    assert.equal(defaults.body.data.autoCollect, false);
    const response = await f.invoke('post', '/api/ranch/settings', { ...req, body: { autoCollect: true } });
    assert.equal(response.body.data.autoCollect, true);
    assert.deepEqual(f.writes, ['mine']); assert.deepEqual(f.calls, ['broadcast:mine']);
    assert.equal((await f.invoke('post', '/api/ranch/settings', { ...req, body: { autoCollect: 1 } })).code, 400);
    assert.equal((await f.invoke('post', '/api/ranch/settings', { ...req, body: { autoDonate: true } })).code, 400);
    assert.equal(f.writes.length, 1);
});
test('persisted switches normalize independently from scene and farm options', () => {
    const store = require('../src/models/store');
    const cfg = store.applyConfigSnapshot({ automation: { ranch_auto_collect: true, ranch_auto_clean: true, farm: false } }, { persist: false, accountId: '__ranch_settings_offline_test__' });
    assert.equal(cfg.automation.ranch_auto_collect, true); assert.equal(cfg.automation.ranch_auto_clean, true);
    assert.equal(cfg.automation.farm, false);
});

test('extended switches and structured policies save atomically and preserve untouched settings', async () => {
    const f = fixture(); const req = { id: 'mine', allowed: true };
    const first = await f.invoke('post', '/api/ranch/settings', { ...req, body: { autoSteal: true, autoUseCan: true, policy: { canItemIds: ['80021'], canMaxPerRun: 2 } } });
    assert.equal(first.code, 200);
    assert.equal(first.body.data.autoUseCan, true);
    assert.equal(first.body.data.policy.canMaxPerRun, 2);
    const second = await f.invoke('post', '/api/ranch/settings', { ...req, body: { autoSell: true, policy: { sellItemIds: ['2060001'], sellKeepCount: 50 } } });
    assert.deepEqual(second.body.data.policy.canItemIds, ['80021']);
    assert.equal(second.body.data.autoSteal, true);
    const bad = await f.invoke('post', '/api/ranch/settings', { ...req, body: { autoSteal: false, policy: { canMaxPerRun: -1 } } });
    assert.equal(bad.code, 400);
    const current = await f.invoke('get', '/api/ranch/settings', req);
    assert.equal(current.body.data.autoSteal, true);
    assert.equal(f.writes.length, 2);
});

test('simple settings disable obsolete gold shopping and rule exchange atomically', async () => {
    const f = fixture(); const req = { id: 'mine', allowed: true };
    await f.invoke('post', '/api/ranch/settings', { ...req, body: { autoBuy: true, autoExchange: true } });
    const result = await f.invoke('post', '/api/ranch/settings', { ...req, body: { autoExchangePoop: true, autoUpgradeRanch: true, autoUpgradeFacilities: false, policy: { mode: 'simple' } } });
    assert.equal(result.code, 200);
    assert.equal(result.body.data.autoBuy, false);
    assert.equal(result.body.data.autoExchange, false);
    assert.equal(result.body.data.autoExchangePoop, true);
    assert.equal(result.body.data.autoUpgradeRanch, true);
    assert.equal(result.body.data.autoUpgradeFacilities, false);
});
test('ranch task reward switch defaults off and round trips independently of farm task', async () => {
    const f = fixture(); const req = { id: 'mine', allowed: true };
    assert.equal((await f.invoke('get', '/api/ranch/settings', req)).body.data.autoClaimTasks, false);
    assert.equal((await f.invoke('post', '/api/ranch/settings', { ...req, body: { autoClaimTasks: true } })).body.data.autoClaimTasks, true);
    assert.equal((await f.invoke('post', '/api/ranch/settings', { ...req, body: { autoClaimTasks: false } })).body.data.autoClaimTasks, false);
    const store = require('../src/models/store');
    const cfg = store.applyConfigSnapshot({ automation: { ranch_auto_claim_tasks: true, task: false } }, { persist: false, accountId: '__ranch_task_rewards_offline_test__' });
    assert.equal(cfg.automation.ranch_auto_claim_tasks, true);
    assert.equal(cfg.automation.task, false);
});
