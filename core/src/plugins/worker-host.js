/**
 * Worker 进程内的活动插件宿主。
 *
 * 每个账号 worker 通过它加载/卸载插件后端模块。插件通过 ctx 桥接拿宿主能力
 * （协议收发、背包、时间、日志、插件状态文件），注册三类扩展：
 *   1. api 方法 —— 主进程 HTTP 路由经 callWorkerApi 调进来；
 *   2. 自动化 runner —— 挂在活动自动化心跳（star claim tick）里按开关执行；
 *   3. 果实保留谓词 —— 仓库卖出逻辑据此保护活动果实。
 * 卸载时调用插件的 worker.unregister 并清掉本插件的 require 缓存。
 *
 * 素材提供者插件（manifest.gameConfig.provides === true）在加载/卸载时
 * 同步 gameConfig.externalGameConfigProviders，保证 worker 进程内
 * getItemImageById/getPlantImageByPhase 等函数也能命中插件素材。
 */

const path = require('node:path');
const { getDataFile } = require('../config/runtime-paths');
const gameConfig = require('../config/gameConfig');

// 插件后端可以 require 的宿主模块白名单（数据目录下 require 不到 node_modules，
// 必须经 ctx.requireModule 从宿主侧解析；支持宿主包的子路径如 protobufjs/minimal）
const ALLOWED_HOST_MODULES = ['protobufjs', 'long'];
const API_METHOD_NAME_PATTERN = /^[a-z]\w{0,63}$/i;
const DATA_FILE_PATH_PATTERN = /\\/g;

function isAllowedHostModule(name) {
    return ALLOWED_HOST_MODULES.some(entry => name === entry || name.startsWith(`${entry}/`));
}

const state = {
    plugins: new Map(), // id -> { id, version, dir, manifest, module, apiMethods, automations, fruitReserves }
};

function clearRequireCache(dir) {
    const resolvedRoot = path.resolve(dir);
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(resolvedRoot + path.sep)) delete require.cache[key];
    }
}

function createWorkerPluginHost({ sendMsgAsync, getUserState, getBag, getBagItems, getServerTimeSec, log }) {
    function buildContext(entry) {
        const apiMethods = new Map();
        const automations = [];
        const fruitReserves = [];
        const pluginLog = (tag, msg, meta) => log(`插件:${entry.manifest.name}`, msg, { module: 'activity', plugin: entry.id, ...(meta || {}) });
        return {
            manifest: entry.manifest,
            pluginId: entry.id,
            version: entry.version,
            log: pluginLog,
            // 注册结果容器必须随 ctx 暴露：宿主 load() 从这里收集插件注册的
            // api 方法 / 自动化 runner / 果实保留谓词
            apiMethods,
            automations,
            fruitReserves,
            requireModule(name) {
                if (!isAllowedHostModule(name)) throw new Error(`插件不允许 require 宿主模块：${name}`);
                return require(name);
            },
            sendMsgAsync,
            isConnected: () => require('../utils/network').isConnected(),
            getUserState,
            getBag,
            getBagItems,
            getServerTimeSec,
            itemDto: require('../services/activity-center-helpers').itemDto,
            helpers: require('../services/activity-center-helpers'),
            // 插件私有持久化状态目录（跨版本保留），如每日用量、领取记录
            dataFile(name) {
                const safe = String(name || '').replace(DATA_FILE_PATH_PATTERN, '/').split('/').filter(part => part && part !== '.' && part !== '..');
                if (!safe.length) throw new Error('dataFile 名称不能为空');
                return path.join(getDataFile('plugins'), 'state', entry.id, ...safe);
            },
            registerApiMethod(name, handler) {
                if (typeof name !== 'string' || !API_METHOD_NAME_PATTERN.test(name)) throw new Error(`api 方法名非法：${name}`);
                if (typeof handler !== 'function') throw new Error(`api 方法 ${name} 的 handler 必须是函数`);
                apiMethods.set(name, handler);
            },
            registerAutomation(spec) {
                if (!spec || typeof spec.run !== 'function') throw new Error('registerAutomation 需要 run 函数');
                automations.push({
                    keys: Array.isArray(spec.keys) ? spec.keys.map(String) : [],
                    run: spec.run,
                });
            },
            registerFruitReserve(fn) {
                if (typeof fn !== 'function') throw new Error('registerFruitReserve 需要函数');
                fruitReserves.push(fn);
            },
        };
    }

    /** 加载插件（幂等：重复加载先卸载旧实例） */
    function load(entry) {
        if (!entry || !entry.id || !entry.dir || !entry.manifest) return;
        unload(entry.id);
        const backendEntry = path.resolve(entry.dir, entry.manifest.backend?.entry || 'backend/index.js');
        let module;
        try {
            module = require(backendEntry);
        } catch (error) {
            log('系统', `加载活动插件 ${entry.id}@${entry.version} 失败：${error.message}`, { module: 'activity', plugin: entry.id, result: 'error' });
            throw error;
        }
        if (module.apiVersion !== entry.manifest.apiVersion) {
            throw new Error(`插件 ${entry.id} apiVersion 与 manifest 不一致`);
        }
        const ctx = buildContext({ ...entry, module });
        const registered = { apiMethods: ctx.apiMethods, automations: ctx.automations, fruitReserves: ctx.fruitReserves };
        try {
            module.worker?.register?.(ctx);
        } catch (error) {
            log('系统', `活动插件 ${entry.id} worker.register 失败：${error.message}`, { module: 'activity', plugin: entry.id, result: 'error' });
            registered.apiMethods.clear();
            registered.automations.length = 0;
            registered.fruitReserves.length = 0;
            clearRequireCache(entry.dir);
            throw error;
        }
        state.plugins.set(entry.id, {
            id: entry.id,
            version: entry.version,
            dir: entry.dir,
            manifest: entry.manifest,
            module,
            ...registered,
        });

        // 素材提供者：同步 gameConfig provider，保证 worker 进程 getItemImageById 命中
        const isMaterial = !!entry.manifest.gameConfig?.provides;
        if (isMaterial) {
            gameConfig.registerExternalGameConfigProvider(entry.dir, entry.manifest.gameConfig.urlPrefix || '/game-config');
        }

        const kind = isMaterial ? '素材插件' : '活动插件';
        const kindModule = isMaterial ? 'material' : 'activity';
        log('系统', `${kind} ${entry.id}@${entry.version} 已加载`, { module: kindModule, plugin: entry.id });
    }

    function unload(pluginId) {
        const existing = state.plugins.get(pluginId);
        if (!existing) return;
        const isMaterial = !!existing.manifest?.gameConfig?.provides;
        try {
            existing.module.worker?.unregister?.();
        } catch (error) {
            log('系统', `插件 ${pluginId} worker.unregister 异常：${error.message}`, { module: 'activity', plugin: pluginId, result: 'error' });
        }

        // 素材提供者：从 gameConfig provider 列表移除
        if (isMaterial) {
            gameConfig.unregisterExternalGameConfigProvider(existing.dir);
        }

        state.plugins.delete(pluginId);
        clearRequireCache(existing.dir);
        const kind = isMaterial ? '素材插件' : '活动插件';
        const kindModule = isMaterial ? 'material' : 'activity';
        log('系统', `${kind} ${pluginId} 已卸载`, { module: kindModule, plugin: pluginId });
    }

    /** 按 worker-manager 下发的清单同步（启动时调用一次） */
    function sync(entries) {
        const wanted = new Set((entries || []).map(entry => entry.id));
        for (const id of [...state.plugins.keys()]) {
            if (!wanted.has(id)) unload(id);
        }
        for (const entry of entries || []) load(entry);
    }

    function get(pluginId) {
        return state.plugins.get(pluginId) || null;
    }

    function list() {
        return [...state.plugins.values()];
    }

    /** handleApiCall 兜底分发：命中插件 api 方法返回 { found, result } */
    async function callApiMethod(method, args) {
        for (const plugin of state.plugins.values()) {
            const handler = plugin.apiMethods && plugin.apiMethods.get(method);
            if (handler) {
                try {
                    return { found: true, result: await handler(...args) };
                } catch (error) {
                    log('活动', `插件 api ${method} 执行失败：${error && error.message ? error.message : error}`, { module: 'activity', plugin: plugin.id, result: 'error' });
                    throw error;
                }
            }
        }
        return { found: false };
    }

    function hasEnabledAutomation(automation) {
        if (!automation) return false;
        for (const plugin of state.plugins.values()) {
            for (const entry of plugin.automations) {
                for (const key of entry.keys) {
                    if (automation[key] === true) return true;
                }
            }
        }
        return false;
    }

    function getAutomationKeys() {
        const keys = [];
        for (const plugin of state.plugins.values()) {
            for (const entry of plugin.automations) keys.push(...entry.keys);
        }
        return keys;
    }

    /** 在活动自动化心跳里执行插件 runner；异常互不影响并落日志 */
    async function runAutomation(context) {
        for (const plugin of state.plugins.values()) {
            for (const entry of plugin.automations) {
                if (!entry.keys.some(key => context.automation?.[key] === true)) continue;
                try {
                    await entry.run(context);
                } catch (error) {
                    if (!error.pluginLogged) {
                        log('活动', `插件 ${plugin.manifest.name} 自动任务失败：${error.message}`, { module: 'activity', plugin: plugin.id, result: 'error' });
                    }
                }
            }
        }
    }

    /** 仓库卖出前询问各插件是否需要保留该果实 */
    // context = { automation, nowSec }；谓词统一从 context 取值，避免多参/对象形状混用
    function reserveFruit(itemId, context = {}) {
        const automation = context.automation;
        const nowSec = context.nowSec;
        for (const plugin of state.plugins.values()) {
            for (const predicate of plugin.fruitReserves) {
                try {
                    if (predicate({ itemId, automation, nowSec }) === true) return true;
                } catch { /* 谓词异常按不保留处理 */ }
            }
        }
        return false;
    }

    function dispose() {
        for (const id of [...state.plugins.keys()]) unload(id);
    }

    return { load, unload, sync, get, list, callApiMethod, hasEnabledAutomation, getAutomationKeys, runAutomation, reserveFruit, dispose };
}

module.exports = { createWorkerPluginHost, ALLOWED_HOST_MODULES };
