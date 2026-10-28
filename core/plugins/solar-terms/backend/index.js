/**
 * 节令小札活动插件 —— 插件入口（常驻活动样例）。
 *
 * 宿主契约（apiVersion 1）：
 *   - admin.register：三条 HTTP 路由（查询 V2 优先 V1 兜底 / 答题 / 领取）。
 *     领取与 V1 兜底经 ctx.callWorker 走宿主内置 V1 实现（千星游记快照共用），
 *     避免 V1 协议双份维护；插件 runner 内的自动领取使用自带的 V1 副本
 *     （runner 无法反向调用内置 worker case）。
 *   - worker.register：V2 协议服务（自带 proto 编译）+ 自动化 runner
 *     （自动领取 star_solar_claim / 自动答题 star_solar_quiz_claim）。
 */

const path = require('node:path');
const { createSolarTermsService, createLegacySolarTermsAccess } = require('./service');

const PLUGIN_ROOT = __dirname;

let service = null;
let legacy = null;

function buildTypes(ctx) {
    // 宿主模块必须经 ctx.requireModule 白名单解析（插件目录解析不到宿主 node_modules）
    const protobuf = ctx.requireModule('protobufjs');
    const root = new protobuf.Root();
    root.loadSync(path.join(PLUGIN_ROOT, 'proto', 'solarterms.proto'), { keepCase: true });
    return {
        GetSolarTermsV2Request: root.lookupType('gamepb.solartermspb.GetSolarTermsV2Request'),
        GetSolarTermsV2Reply: root.lookupType('gamepb.solartermspb.GetSolarTermsV2Reply'),
        AnswerSolarTermsRequest: root.lookupType('gamepb.solartermspb.AnswerSolarTermsRequest'),
        AnswerSolarTermsReply: root.lookupType('gamepb.solartermspb.AnswerSolarTermsReply'),
    };
}

function ensureServices(ctx) {
    if (service) return;
    const assertConnected = (action) => {
        if (!ctx.isConnected()) throw new Error(`${action || '活动操作'}失败: 连接已断开，请等待自动重连后重试`);
    };
    service = createSolarTermsService({
        types: buildTypes(ctx),
        send: ctx.sendMsgAsync,
        assertConnected,
        now: ctx.getServerTimeSec,
        mapItem: ctx.itemDto,
    });
    legacy = createLegacySolarTermsAccess({
        send: ctx.sendMsgAsync,
        now: ctx.getServerTimeSec,
        helpers: ctx.helpers,
        requireModule: ctx.requireModule,
        catalog: require('./catalog/SolarTerms.json'),
        log: ctx.log,
    });
}

/** 自动化 runner：从宿主 worker.js 节令块迁移而来 */
async function runSolarTermsAutomation(runContext) {
    const { automation, isAccountReady, log } = runContext;
    if (!service) return;

    if (automation?.star_solar_claim === true) {
        let info;
        try {
            info = await legacy.getLegacySolarTermsInfo();
        } catch (error) {
            log('活动', `节令小札读取失败：${error.message}`, { module: 'activity', event: '节令小札自动检查', result: 'error' });
            info = { terms: [] };
        }
        for (const term of (info.terms || []).filter(term => term.claimable)) {
            if (isAccountReady && !isAccountReady()) break;
            try {
                const result = await legacy.claimLegacySolarTermsReward(Number(term.id) || 0);
                log('活动', `自动领取节令小札完成：${result.term?.title || term.title}，${(result.rewards || []).length} 项奖励`, {
                    module: 'activity', event: '节令小札自动领取', result: 'success', termId: term.id, termTitle: term.title,
                });
            } catch (error) {
                log('活动', `自动领取节令小札失败：${error.message}`, {
                    module: 'activity', event: '节令小札自动领取', result: 'error', termId: term.id, termTitle: term.title,
                });
            }
        }
    }

    if (automation?.star_solar_quiz_claim === true) {
        await service.autoClaim({
            enabled: () => (!isAccountReady || isAccountReady()) && automation.star_solar_quiz_claim === true,
            onResult: (result, term) => log('活动', `${result.correct ? '自动领取节令答题附加奖励完成' : '节令答题未答对'}：${term.title}`, {
                module: 'activity', event: '节令答题自动领取', result: result.correct ? 'success' : 'skip', termId: term.id, termTitle: term.title, correct: !!result.correct,
            }),
            onError: (error, term) => log('活动', `节令答题自动领取失败：${error.message}`, {
                module: 'activity', event: '节令答题自动领取', result: 'error', termId: term?.id, termTitle: term?.title,
            }),
        });
    }
}

module.exports = {
    apiVersion: 1,
    admin: {
        register(ctx) {
            ctx.route('get', '/api/activity/solar-terms', async (req, res) => {
                const accountId = ctx.requireAccount(req, res);
                if (!accountId) return;
                try {
                    if (!ctx.requireConnected(res, accountId, '账号未运行')) return;
                    let solarTerms;
                    try {
                        solarTerms = await ctx.callWorker(accountId, 'getSolarTermsV2Info', [], 90000);
                    } catch (error) {
                        solarTerms = { ...await ctx.callWorker(accountId, 'getSolarTermsInfo', [], 90000), warning: `新版答题状态读取失败：${error.message}` };
                    }
                    res.json({ ok: true, solarTerms });
                } catch (error) { ctx.sendError(res, error); }
            });
            ctx.route('post', '/api/activity/solar-terms/answer', async (req, res) => {
                const accountId = ctx.requireAccount(req, res);
                if (!accountId) return;
                try {
                    if (!ctx.requireConnected(res, accountId, '账号未运行')) return;
                    const termId = Number(req.body?.termId) || 0;
                    const optionIndex = Number(req.body?.optionIndex);
                    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) {
                        return res.status(400).json({ ok: false, error: '选项无效' });
                    }
                    res.json(await ctx.callWorker(accountId, 'answerSolarTerm', [termId, optionIndex], 90000));
                } catch (error) { ctx.sendError(res, error); }
            });
            ctx.route('post', '/api/activity/solar-terms/claim', async (req, res) => {
                const accountId = ctx.requireAccount(req, res);
                if (!accountId) return;
                try {
                    if (!ctx.requireConnected(res, accountId, '账号未运行')) return;
                    // V1 领取协议与千星游记快照共用宿主内置实现
                    res.json(await ctx.callWorker(accountId, 'claimSolarTermsReward', [Number(req.body?.termId) || 0], 90000));
                } catch (error) { ctx.sendError(res, error); }
            });
        },
        unregister() { /* 路由摘除由宿主完成 */ },
    },
    worker: {
        register(ctx) {
            ensureServices(ctx);
            ctx.registerApiMethod('getSolarTermsV2Info', () => service.getInfo());
            ctx.registerApiMethod('answerSolarTerm', (termId, optionIndex, canProceed) => service.answer(termId, optionIndex, canProceed));
            ctx.registerAutomation({
                keys: ['star_solar_claim', 'star_solar_quiz_claim'],
                run: runContext => runSolarTermsAutomation({ ...runContext, log: ctx.log }),
            });
        },
        unregister() {
            service = null;
            legacy = null;
        },
    },
};
