/**
 * 奶茶热销中活动插件 —— 插件入口。
 *
 * 宿主契约（apiVersion 1）：
 *   - admin.register(ctx)：在主进程注册 HTTP 路由（账号鉴权、callWorker 桥由 ctx 提供）；
 *   - worker.register(ctx)：在账号 worker 内创建活动服务（自带 proto 编译），
 *     注册 api 方法、自动化 runner 与果实保留谓词；
 *   - unregister：宿主负责摘路由/清缓存，这里只清模块级单例。
 */

const path = require('node:path');
const { createMilkTeaService, AUTO_ACTIONS, phase, reserveMilkTeaFruit, normalizeHireOptions, setProtobufRuntime } = require('./service');

const PLUGIN_ROOT = __dirname;

// worker 进程内的服务单例：每账号 worker 一个实例
let service = null;

function buildTypes(ctx) {
    // 宿主模块必须经 ctx.requireModule 白名单解析：插件安装目录（data 目录或 pkg
    // 快照外）向上遍历不到宿主 node_modules，直接 require 会 MODULE_NOT_FOUND
    const protobuf = ctx.requireModule('protobufjs');
    const root = new protobuf.Root();
    // loadSync 按 import 语句在同目录解析 activitypb/pet-diary/corepb
    root.loadSync(path.join(PLUGIN_ROOT, 'proto', 'milk-tea.proto'), { keepCase: true });
    return {
        MilkTeaOperateRequest: root.lookupType('gamepb.activitypb.MilkTeaOperateRequest'),
        MilkTeaOperateReply: root.lookupType('gamepb.activitypb.MilkTeaOperateReply'),
        MilkTeaGetGroupReply: root.lookupType('gamepb.activitypb.MilkTeaGetGroupReply'),
        ActivityGetGroupRequest: root.lookupType('gamepb.activitypb.GetGroupRequest'),
    };
}

function ensureService(ctx) {
    if (service) return service;
    service = createMilkTeaService({
        types: buildTypes(ctx),
        sendMsgAsync: ctx.sendMsgAsync,
        getBag: ctx.getBag,
        getBagItems: ctx.getBagItems,
        getUserState: ctx.getUserState,
        getServerTimeSec: ctx.getServerTimeSec,
        itemDto: ctx.itemDto,
        helpers: ctx.helpers,
        log: ctx.log,
    });
    return service;
}

/**
 * 活动自动化 runner：从原 core/src/core/worker.js 奶茶块迁移而来。
 * 每个开关逐个检查，前置条件不满足的 action 直接跳过；操作失败由服务层
 * 记日志（milkTeaLogged），查询失败在此兜底记录。
 */
async function runMilkTeaAutomation(runContext) {
    const { automation, getServerTimeSec, isAccountReady, log } = runContext;
    if (!service) return;
    for (const [key, action] of Object.entries(AUTO_ACTIONS)) {
        if (isAccountReady && !isAccountReady()) continue;
        if (automation?.[key] !== true) continue;
        const currentPhase = phase(getServerTimeSec());
        if (!['business', 'settling'].includes(currentPhase)) break;
        try {
            const state = await service.getMilkTea();
            if (!Number(state.summary.shop_open_at) && !['shareDaily', 'shareRewards', 'fundRewards'].includes(action)) continue;
            let params = {};
            if (action === 'buy') {
                const goods = state.goods.find(x => x.category_tag === 'seed' && x.unlocked && x.remaining > 0 && !x.paid && x.affordable);
                if (!goods) continue;
                params = { goodsId: goods.id, count: 1 };
            }
            if (action === 'hire') {
                const capacity = state.levels.find(x => x.level === Number(state.shop.level))?.employee_slot_count || 0;
                const slot = Array.from({ length: capacity }, (_, i) => i).find(i => !state.shop.slots.some(x => Number(x.slot_index) === i && Number(x.end_at) > state.serverTime));
                if (slot == null) continue;
                params = { slotIndex: slot, autoSelect: true, ...normalizeHireOptions({
                    durationId: automation.milk_tea_hire_duration, talentId: automation.milk_tea_hire_talent,
                }) };
            }
            if (action === 'cashier' && !state.shop.pending_rewards.some(x => Number(x.count) > 0)) continue;
            if (action === 'craft' && !state.recipes.some(recipe => recipe.unlocked && recipe.fruits?.length)) continue;
            if (action === 'boost' && !state.balances.some(item => String(item.id) === String(state.shop.sales_item_id) && Number(item.count) > 0)) continue;
            if (action === 'wages' && !state.summary.has_unclaimed_wage) continue;
            if (action === 'upgrade' && !state.summary.can_upgrade) continue;
            if (currentPhase === 'settling' && !['cashier', 'wages', 'shareDaily', 'shareRewards', 'fundRewards'].includes(action)) continue;
            if (action === 'shareDaily' && state.share?.daily?.daily_reward_claimed) continue;
            if (action === 'shareRewards' && !state.share?.milestones?.some(x => Number(x.state) === 2)) continue;
            if (action === 'fundRewards' && (!state.fund?.unlocked || !state.fund.tiers.some(x => Number(x.state) === 2))) continue;
            if (action === 'interact') {
                const shift = state.work?.my_shift;
                if (!shift || Number(shift.end_at) <= state.serverTime || state.work.interact_done || Number(shift.interact_count) >= Number(shift.interact_limit)) continue;
                params = { interactionType: Number(automation.milk_tea_work_interact_type) || 1 };
            }
            await service.operateMilkTea(action, params);
        } catch (error) {
            // Mutation failures are logged by the shared service; retain query failures here.
            if (!error.milkTeaLogged) log('活动', `奶茶热销中自动检查失败：${error.message}`, { module: 'activity', event: '奶茶热销中自动检查', result: 'error' });
        }
    }
}

module.exports = {
    apiVersion: 1,
    admin: {
        register(ctx) {
            ctx.route('get', '/api/activity/milk-tea', async (req, res) => {
                const accountId = ctx.requireAccount(req, res);
                if (!accountId) return;
                try {
                    if (!ctx.requireConnected(res, accountId, '账号未运行')) return;
                    res.json({ ok: true, activity: await ctx.callWorker(accountId, 'getMilkTea', [], 90000) });
                } catch (error) { ctx.sendError(res, error); }
            });
            for (const kind of ['operate', 'records']) {
                ctx.route('post', `/api/activity/milk-tea/${kind}`, async (req, res) => {
                    const accountId = ctx.requireAccount(req, res);
                    if (!accountId) return;
                    try {
                        if (!ctx.requireConnected(res, accountId, '账号未运行')) return;
                        const result = kind === 'operate'
                            ? await ctx.callWorker(accountId, 'operateMilkTea', [req.body?.action, req.body?.params || {}], 190000)
                            : await ctx.callWorker(accountId, 'milkTeaRecords', [req.body?.kind, req.body?.params || {}], 90000);
                        res.json({ ok: true, ...result });
                    } catch (error) { ctx.sendError(res, error); }
                });
            }
        },
        unregister() { /* 路由摘除由宿主完成 */ },
    },
    worker: {
        register(ctx) {
            // 先注入 protobufjs（normalizeWireMaps 依赖），再创建服务
            setProtobufRuntime(ctx.requireModule('protobufjs'));
            ensureService(ctx);
            ctx.registerApiMethod('getMilkTea', (force = false) => service.getMilkTea(force));
            ctx.registerApiMethod('operateMilkTea', (action, params) => service.operateMilkTea(action, params));
            ctx.registerApiMethod('milkTeaRecords', (kind, params) => service.milkTeaRecords(kind, params));
            ctx.registerAutomation({
                keys: Object.keys(AUTO_ACTIONS),
                run: runContext => runMilkTeaAutomation({ ...runContext, log: ctx.log }),
            });
            // 仓库卖出保护：营业期内、自动制作开启时保留活动果实
            ctx.registerFruitReserve(({ itemId, automation, nowSec }) => {
                return reserveMilkTeaFruit(itemId, automation?.milk_tea_craft === true, nowSec);
            });
        },
        unregister() {
            service = null;
        },
    },
};
