const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAdminRanchRoutes } = require('../src/controllers/admin-ranch-routes');

test('ranch daily settings reuse the existing share switch and do not rewrite policy', async () => {
    const routes = new Map();
    const automation = { share_claim_daily: true, ranch_auto_daily_benefit: false, ranch_auto_buy: true };
    const calls = [];
    const app = Object.fromEntries(['get', 'post'].map(method => [method, (path, run) => routes.set(`${method} ${path}`, run)]));
    registerAdminRanchRoutes({
        app,
        store: {
            getAutomation: () => automation,
            applyConfigSnapshot: (patch, options) => {
                calls.push([patch, options]);
                Object.assign(automation, patch.automation);
            },
        },
        provider: { broadcastConfigToWorkers: id => calls.push(id) },
        getAccountIdFromRequest: () => 'ranch-account',
        canAccessAccount: () => true,
        sendProviderError: (_res, error) => { throw error; },
    });
    const run = async (method, body) => {
        let result;
        await routes.get(`${method} /api/ranch/settings`)({ body }, { json: data => { result = data; } });
        return result;
    };
    assert.equal((await run('get')).data.autoClaimShareReward, true);
    const saved = await run('post', { autoDailyBenefit: true, autoClaimShareReward: false });
    assert.equal(saved.data.autoDailyBenefit, true);
    assert.equal(saved.data.autoClaimShareReward, false);
    assert.deepEqual(calls, [[{ automation: { ranch_auto_daily_benefit: true, share_claim_daily: false } }, { accountId: 'ranch-account' }], 'ranch-account']);
    assert.equal(automation.ranch_auto_buy, true);
});
