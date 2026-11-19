const { CAPABILITIES } = require('../services/ranch');
const { describeRanchIllustrated } = require('./admin-ranch-illustrated');
const { normalizeSettings, SETTINGS_KEYS, normalizePolicy, getPolicyOptions, LIMITS } = require('../services/ranch-settings');

function registerAdminRanchRoutes({ app, provider, store, adminLogger, getAccountIdFromRequest, canAccessAccount, sendProviderError }) {
    const account = (req, res) => {
        const id = getAccountIdFromRequest(req);
        if (!id) { res.status(400).json({ ok: false, error: '缺少账号标识' }); return null; }
        if (!canAccessAccount(req, id)) { res.status(403).json({ ok: false, error: '无权访问此账号' }); return null; }
        return id;
    };
    const route = (method, path, fn) => app[method](path, async (req, res) => {
        const id = account(req, res);
        if (!id) return;
        try { res.json({ ok: true, data: await fn(id, req.body || {}) }); }
        catch (err) {
            adminLogger?.error('牧场请求失败', { method, path, accountId: id, error: err.message, stack: err.stack });
            sendProviderError(res, err);
        }
    });

    // 路径用短横线，资源名保持 camelCase，避免前端 URL 和内部标识混用。
    for (const [path, resource] of [['friends', 'friends'], ['activity', 'activity'], ['shop', 'shop'], ['analytics', 'analytics'], ['profile', 'profile'], ['daily-benefit', 'dailyBenefit']]) {
        route('get', `/api/ranch/${path}`, id => provider.getRanchResource(id, resource));
    }
    route('get', '/api/ranch/illustrated', async id => describeRanchIllustrated(await provider.getRanchResource(id, 'illustrated')));
    route('get', '/api/ranch/status', id => provider.getRanchStatus(id));
    route('post', '/api/ranch/connect', id => provider.connectRanch(id));
    route('post', '/api/ranch/disconnect', id => provider.disconnectRanch(id));
    route('post', '/api/ranch/action', (id, body) => provider.ranchAction(id, body));

    const settings = id => {
        const automation = store.getAutomation(id);
        return {
            ...normalizeSettings(automation),
            autoClaimShareReward: automation.share_claim_daily === true,
            policy: normalizePolicy(automation.ranch_policy),
            policyOptions: getPolicyOptions(),
            policyLimits: LIMITS,
            capabilities: { ...CAPABILITIES, dailyShareReward: true },
        };
    };
    route('get', '/api/ranch/settings', id => settings(id));
    route('post', '/api/ranch/settings', (id, body) => {
        const current = store.getAutomation(id);
        const patch = {};
        for (const [key, value] of Object.entries(body)) {
            if (key === 'policy') {
                if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效牧场策略');
                patch.ranch_policy = normalizePolicy({ ...normalizePolicy(current.ranch_policy), ...value }, true);
                continue;
            }
            const automationKey = key === 'autoClaimShareReward' ? 'share_claim_daily' : (Object.hasOwn(SETTINGS_KEYS, key) ? SETTINGS_KEYS[key] : null);
            if (!automationKey || typeof value !== 'boolean') throw new Error('无效牧场设置');
            patch[automationKey] = value;
        }
        if (patch.ranch_policy?.mode === 'simple') {
            patch.ranch_auto_buy = false;
            patch.ranch_auto_exchange = false;
        }
        store.applyConfigSnapshot({ automation: patch }, { accountId: id });
        provider.broadcastConfigToWorkers(id);
        return settings(id);
    });
}

module.exports = { registerAdminRanchRoutes };
