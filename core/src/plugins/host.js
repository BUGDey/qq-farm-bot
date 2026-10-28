/**
 * 主进程（Admin Server）内的活动插件宿主。
 *
 * 职责：
 *   - 安装：校验 zip → 原子解压 → 校验 manifest 与素材映射 → 落盘到 data/plugins/installed/<id>/<version>/；
 *   - 激活：require 插件 backend/index.js 并调用 admin.register(ctx)（ctx 提供带路由追踪的
 *     route 注册、账号鉴权 helper、callWorker 桥、日志），随后向全部 worker 广播 plugin_load，
 *     并刷新 store 的插件自动化注册表 —— 不重启、不重编译，立即生效；
 *   - 停用/升级/卸载：先调 admin.unregister、摘除本插件注册的 Express 路由层、广播 plugin_unload，
 *     清 require 缓存后再加载新版本；
 *   - 回滚：保留上一版本目录，可一键切回。
 *
 * 安全边界：插件后端是受信任管理员上传的任意 JS，权限等同宿主；缓解手段为
 * 上传仅限 admin 角色、zip 严格校验、能力经 ctx 桥接、安装留痕与版本回滚。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateManifest } = require('./manifest');
const { extractPluginZip } = require('./zip');
const {
    getPluginInstallDir, readRegistry, writeRegistry, findEntry, upsertEntry, removeEntry, getPluginsRoot,
} = require('./registry');
const gameConfig = require('../config/gameConfig');

const PLUGIN_API_METHOD_TIMEOUT = { getMilkTea: 90000, getPetDiary: 90000 };

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function removeRouteLayers(app, layers) {
    const stack = app?._router?.stack;
    if (!Array.isArray(stack)) return;
    for (const layer of layers) {
        const index = stack.indexOf(layer);
        if (index >= 0) stack.splice(index, 1);
    }
}

/**
 * 校验素材映射表：manifest.frontend.assetPrefix 下的 assets-map.json（若存在）
 * 逐条校验文件存在且 sha256 匹配，防止传输截断或版本错混。
 */
function verifyAssetMap(pluginDir) {
    const mapPath = path.join(pluginDir, 'assets', 'assets-map.json');
    if (!fs.existsSync(mapPath)) return;
    let mapping;
    try {
        mapping = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    } catch (error) {
        throw new Error(`assets-map.json 不是合法 JSON：${error.message}`);
    }
    const entries = Array.isArray(mapping) ? mapping : Object.values(mapping || {});
    let checked = 0;
    for (const item of entries) {
        const file = String(item?.file || item?.path || '');
        const expected = String(item?.sha256 || '');
        if (!file || !expected) continue;
        const absolute = path.resolve(pluginDir, 'assets', file);
        if (!absolute.startsWith(path.resolve(pluginDir, 'assets') + path.sep)) {
            throw new Error(`assets-map 路径越界：${file}`);
        }
        if (!fs.existsSync(absolute)) throw new Error(`素材缺失：assets/${file}`);
        const actual = sha256(fs.readFileSync(absolute));
        if (actual !== expected.toLowerCase()) throw new Error(`素材 sha256 不匹配：assets/${file}`);
        checked += 1;
    }
    if (!checked) throw new Error('assets-map.json 未包含可校验的 file+sha256 条目');
}

function createPluginHost({
    app,
    provider,
    requireAdminRole,
    getAuthorizedAccountId,
    requireConnectedAccount,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
    log,
}) {
    // id -> { id, version, dir, manifest, module, layers, storeKeys }
    const active = new Map();

    function broadcastToWorkers(message) {
        if (typeof provider?.sendToWorkers === 'function') {
            provider.sendToWorkers(message);
        }
    }

    function reloadStoreRegistry() {
        try {
            require('../models/store').reloadPluginAutomationRegistry();
        } catch (error) {
            log('错误', `刷新插件自动化注册表失败：${error.message}`);
        }
    }

    function buildAdminContext(entry) {
        const layers = [];
        const context = {
            manifest: entry.manifest,
            pluginId: entry.id,
            version: entry.version,
            log: (tag, msg, meta) => log(`插件:${entry.manifest.name}`, msg, { module: 'activity', plugin: entry.id, ...(meta || {}) }),
            // 注册路由：插入到 SPA fallback（app.get('*')）之前，保证运行时上传的
            // GET 路由也能命中；层句柄被记录，停用时精确摘除。
            route(method, routePath, ...handlers) {
                const normalized = String(method || '').toLowerCase();
                if (!['get', 'post', 'put', 'delete', 'patch'].includes(normalized)) {
                    throw new Error(`插件不允许注册 ${method} 路由`);
                }
                const routePathStr = String(routePath || '');
                if (!routePathStr.startsWith('/api/')) throw new Error('插件路由必须挂在 /api/ 前缀下');
                const before = app._router?.stack?.length ?? 0;
                app[normalized](routePathStr, ...handlers);
                const stack = app._router.stack;
                const added = stack.splice(before, stack.length - before);
                let fallbackIndex = stack.findIndex(layer => layer.route && layer.route.path === '*');
                if (fallbackIndex < 0) fallbackIndex = stack.length;
                stack.splice(fallbackIndex, 0, ...added);
                layers.push(...added);
            },
            requireAccount(req, res) {
                return getAuthorizedAccountId(req, res, {
                    getAccountIdFromRequest,
                    canAccessAccount,
                });
            },
            requireConnected(res, accountId, message) {
                return requireConnectedAccount(res, provider, accountId, message);
            },
            // 调用 worker 内插件注册的 api 方法；operate 类长 RPC 需显式传 timeoutMs
            async callWorker(accountId, method, args = [], timeoutMs = PLUGIN_API_METHOD_TIMEOUT[method] || 60000) {
                return provider.callWorker(accountId, method, ...args, { _timeoutMs: timeoutMs });
            },
            sendError(res, error) {
                sendProviderError(res, error);
            },
            requireAdminRole,
            nowSec: () => Math.floor(Date.now() / 1000),
        };
        return { context, layers };
    }

    /** 激活已安装版本：注册主进程路由 + 通知全部 worker 加载 */
    function activate(entry) {
        const backendEntry = path.resolve(entry.dir, entry.manifest.backend?.entry || 'backend/index.js');
        const module = require(backendEntry);
        const { context, layers } = buildAdminContext(entry);
        try {
            module.admin?.register?.(context);
        } catch (error) {
            removeRouteLayers(app, layers);
            throw new Error(`插件 ${entry.id} admin.register 失败：${error.message}`);
        }
        active.set(entry.id, { ...entry, module, layers });
        const isMaterial = !!entry.manifest.gameConfig?.provides;
        if (isMaterial) {
            gameConfig.registerExternalGameConfigProvider(entry.dir, entry.manifest.gameConfig.urlPrefix || '/game-config');
        }
        broadcastToWorkers({ type: 'plugin_load', plugin: { id: entry.id, version: entry.version, dir: entry.dir, manifest: entry.manifest } });
        reloadStoreRegistry();
        const kind = isMaterial ? '素材插件' : '活动插件';
        const kindModule = isMaterial ? 'material' : 'activity';
        log('系统', `${kind} ${entry.id}@${entry.version} 已激活${isMaterial ? '（含植物/种子/阶段图合并）' : ''}`, { module: kindModule, plugin: entry.id });
    }

    /** 停用插件：摘路由、通知 worker 卸载、清缓存；保留文件与注册表 */
    function deactivate(pluginId) {
        const entry = active.get(pluginId);
        if (!entry) return;
        const isMaterial = !!entry.manifest.gameConfig?.provides;
        try {
            entry.module.admin?.unregister?.();
        } catch (error) {
            log('错误', `插件 ${pluginId} admin.unregister 异常：${error.message}`);
        }
        removeRouteLayers(app, entry.layers);
        active.delete(pluginId);
        if (isMaterial) {
            gameConfig.unregisterExternalGameConfigProvider(entry.dir);
        }
        broadcastToWorkers({ type: 'plugin_unload', pluginId });
        reloadStoreRegistry();
        const kind = isMaterial ? '素材插件' : '活动插件';
        const kindModule = isMaterial ? 'material' : 'activity';
        log('系统', `${kind} ${pluginId} 已停用`, { module: kindModule, plugin: pluginId });
    }

    /**
     * 安装 zip 并可选立即激活。同一 id 重复安装即升级：停用旧版 → 覆盖安装 →
     * 保留上一版本目录用于回滚。返回注册表条目。
     */
    function install(zipBuffer, { activate: shouldActivate = true } = {}) {
        const stagingDir = path.join(getPluginsRoot(), '.staging', `upload-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
        fs.mkdirSync(stagingDir, { recursive: true });
        try {
            const { manifest } = extractPluginZip(zipBuffer, stagingDir);
            const validated = validateManifest(manifest);
            if (validated.error) throw new Error(validated.error);
            const normalized = validated.manifest;
            // 前端入口与素材映射校验
            for (const relativeFile of [normalized.frontend.entry, normalized.frontend.css]) {
                if (relativeFile && !fs.existsSync(path.join(stagingDir, relativeFile))) {
                    throw new Error(`插件包缺少前端文件：${relativeFile}`);
                }
            }
            if (normalized.frontend.assetPrefix && fs.existsSync(path.join(stagingDir, 'assets'))) {
                verifyAssetMap(stagingDir);
            }
            // backend 可选：纯素材插件可能只有 assets 与映射
            const backendEntry = normalized.backend?.entry ? path.resolve(stagingDir, normalized.backend.entry) : null;
            if (backendEntry) {
                if (!fs.existsSync(backendEntry)) throw new Error('插件包缺少 backend/index.js');
                try {
                    const probe = require(backendEntry);
                    if (probe.apiVersion !== normalized.apiVersion) throw new Error('backend apiVersion 与 manifest 不一致');
                } finally {
                    for (const key of Object.keys(require.cache)) {
                        if (key.startsWith(path.resolve(stagingDir) + path.sep)) delete require.cache[key];
                    }
                }
            } else {
                for (const key of Object.keys(require.cache)) {
                    if (key.startsWith(path.resolve(stagingDir) + path.sep)) delete require.cache[key];
                }
            }

            const registry = readRegistry();
            const existing = findEntry(registry, normalized.id);
            if (existing) deactivate(normalized.id);

            // 资源前缀冲突检查：两个插件不得声明同一个 assetPrefix
            if (normalized.frontend.assetPrefix) {
                for (const entry of active.values()) {
                    if (entry.manifest.frontend.assetPrefix === normalized.frontend.assetPrefix) {
                        throw new Error(`静态资源前缀冲突：${normalized.frontend.assetPrefix} 已被插件 ${entry.id} 占用`);
                    }
                }
            }

            const installDir = path.join(getPluginInstallDir(normalized.id), normalized.version);
            fs.rmSync(installDir, { recursive: true, force: true });
            fs.mkdirSync(path.dirname(installDir), { recursive: true });
            fs.renameSync(stagingDir, installDir);

            const now = Date.now();
            const history = [...(existing?.history || [])];
            if (existing && existing.version !== normalized.version) {
                history.unshift({ version: existing.version, installedAt: existing.installedAt, dir: existing.dir });
            }
            const entry = {
                id: normalized.id,
                name: normalized.name,
                version: normalized.version,
                enabled: shouldActivate,
                installedAt: existing?.installedAt || now,
                updatedAt: now,
                dir: installDir,
                manifest: normalized,
                error: '',
                history: history.slice(0, 3).filter(item => item.version !== normalized.version && fs.existsSync(item.dir || 'x')),
            };
            upsertEntry(entry);
            // 清理不再保留的历史版本目录（仅保留当前版本 + 最近 3 个历史版本）
            const keepDirs = new Set([installDir, ...entry.history.map(item => item.dir)]);
            const versionRoot = getPluginInstallDir(normalized.id);
            try {
                for (const name of fs.readdirSync(versionRoot)) {
                    const candidate = path.join(versionRoot, name);
                    if (!keepDirs.has(candidate)) fs.rmSync(candidate, { recursive: true, force: true });
                }
            } catch { /* 目录不存在则跳过 */ }
            if (shouldActivate) activate(entry);
            return entry;
        } finally {
            fs.rmSync(stagingDir, { recursive: true, force: true });
        }
    }

    /** 启用（enable）已安装插件 */
    function enable(pluginId) {
        const registry = readRegistry();
        const entry = findEntry(registry, pluginId);
        if (!entry) throw new Error(`插件不存在：${pluginId}`);
        if (active.has(pluginId)) return entry;
        activate(entry);
        entry.enabled = true;
        entry.error = '';
        writeRegistry(registry);
        return entry;
    }

    /** 停用（disable）：插件下线但保留安装 */
    function disable(pluginId) {
        const registry = readRegistry();
        const entry = findEntry(registry, pluginId);
        if (!entry) throw new Error(`插件不存在：${pluginId}`);
        if (entry.manifest?.gameConfig?.provides) {
            throw new Error('素材插件（提供 gameConfig 合并）禁止停用，如需更新请上传新版本覆盖');
        }
        deactivate(pluginId);
        entry.enabled = false;
        writeRegistry(registry);
        return entry;
    }

    /** 卸载：停用 + 删除文件与注册表；返回被移除的自动化 key 供上层强制关闭 */
    function uninstall(pluginId) {
        const registry = readRegistry();
        const entry = findEntry(registry, pluginId);
        if (!entry) throw new Error(`插件不存在：${pluginId}`);
        if (entry.manifest?.gameConfig?.provides) {
            throw new Error('素材插件（提供 gameConfig 合并）禁止卸载，如需更新请上传新版本覆盖');
        }
        deactivate(pluginId);
        removeEntry(pluginId);
        const keys = (entry.manifest?.automation || []).map(spec => spec.key);
        fs.rmSync(getPluginInstallDir(pluginId), { recursive: true, force: true });
        // 插件持久化状态保留（state/<id>/），便于重装后恢复
        log('系统', `插件 ${pluginId} 已卸载`, { module: 'activity', plugin: pluginId });
        return { manifest: entry.manifest, keys };
    }

    /** 回滚到保留的上一版本 */
    function rollback(pluginId) {
        const registry = readRegistry();
        const entry = findEntry(registry, pluginId);
        if (!entry) throw new Error(`插件不存在：${pluginId}`);
        const previous = (entry.history || [])[0];
        if (!previous || !fs.existsSync(previous.dir)) throw new Error('没有可回滚的历史版本');
        deactivate(pluginId);
        const currentVersion = entry.version;
        const currentDir = entry.dir;
        entry.version = previous.version;
        entry.dir = previous.dir;
        entry.manifest = (() => {
            try {
                const { validateManifest: validate } = require('./manifest');
                return validate(JSON.parse(fs.readFileSync(path.join(previous.dir, 'manifest.json'), 'utf8'))).manifest;
            } catch (error) {
                throw new Error(`历史版本 manifest 损坏：${error.message}`);
            }
        })();
        entry.updatedAt = Date.now();
        entry.history = [{ version: currentVersion, installedAt: entry.updatedAt, dir: currentDir }];
        upsertEntry(entry);
        activate(entry);
        return entry;
    }

    /**
     * 自举内置插件：启动时扫描仓库 plugins/ 下的目录（与兼容旧 builtin/*.zip），
     * 注册表缺失就自动复制安装；版本落后时自动升级。
     * 只负责安装 + 写入 registry（enabled=true），激活交给 restoreAll() 统一处理。
     *
     * 内置目录约定：<coreRoot>/plugins/<plugin-id>/manifest.json
     *   — material-plugin、milk-tea 等均直接以解压目录形式放在 plugins/ 下。
     *
     * 旧 zip 兼容：<coreRoot>/plugins/builtin/*.zip（保留一段过渡期，后续可删除）。
     */
    function bootstrapBuiltins() {
        const pluginsRoot = path.resolve(__dirname, '../../plugins');
        if (!fs.existsSync(pluginsRoot)) return;

        const registry = readRegistry();
        const existingIds = new Set(registry.plugins.map(e => e.id));
        let bootstrapped = 0;

        // --- 1. 内置目录（新方式）：扫 plugins/*/manifest.json ---
        for (const name of fs.readdirSync(pluginsRoot, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'builtin')
            .map(d => d.name)) {
            const srcDir = path.join(pluginsRoot, name);
            const manifestPath = path.join(srcDir, 'manifest.json');
            if (!fs.existsSync(manifestPath)) continue;

            let manifestObj;
            try {
                manifestObj = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            } catch (error) {
                log('系统', `内置目录 ${name} manifest.json 解析失败：${error.message}`);
                continue;
            }
            if (!manifestObj?.id || !manifestObj?.version) {
                log('系统', `内置目录 ${name} manifest 缺 id/version，跳过`);
                continue;
            }

            const installDir = path.join(getPluginInstallDir(manifestObj.id), manifestObj.version);
            const alreadyInstalled = fs.existsSync(installDir);
            const existingEntry = findEntry(registry, manifestObj.id);

            if (existingEntry && existingEntry.version === manifestObj.version && alreadyInstalled) {
                continue; // 已安装且版本匹配，跳过
            }

            // 只有当内置目录版本 >= 已安装版本时才覆盖（允许用户上传更高版本的 zip 保留）
            // 比较版本：返回正数说明 a > b
            const semverGte = (a, b) => {
                const pa = String(a).split('.').map(Number);
                const pb = String(b).split('.').map(Number);
                const len = Math.max(pa.length, pb.length);
                for (let i = 0; i < len; i += 1) {
                    const na = pa[i] || 0, nb = pb[i] || 0;
                    if (na !== nb) return na >= nb;
                }
                return true; // 相等也算 >=
            };

            // 如果用户已经安装了更高版本，跳过 bootstrap（不要覆盖用户上传的新版本）
            if (existingEntry && existingEntry.version && !semverGte(manifestObj.version, existingEntry.version)) {
                log('系统', `内置插件 ${manifestObj.id} 跳过：已安装版本 ${existingEntry.version} 高于内置 ${manifestObj.version}`);
                continue;
            }

            try {
                // 复制整个目录到 data/plugins/installed/<id>/<version>/
                // 先清理旧版本目录（包括可能用户上传的同版本历史），但保留更高版本目录
                const installedRoot = getPluginInstallDir(manifestObj.id);
                if (fs.existsSync(installedRoot)) {
                    // 只删除 <= 当前内置版本的目录
                    for (const name of fs.readdirSync(installedRoot)) {
                        const verDir = path.join(installedRoot, name);
                        if (!fs.statSync(verDir).isDirectory()) continue;
                        if (semverGte(manifestObj.version, name)) {
                            fs.rmSync(verDir, { recursive: true, force: true });
                        }
                    }
                }
                // 镜像 pack.js 的 zip 布局，而不是整目录复制
                // manifest.json 直接在安装目录根
                fs.mkdirSync(installDir, { recursive: true });
                fs.copyFileSync(path.join(srcDir, 'manifest.json'), path.join(installDir, 'manifest.json'));

                // backend/ 原样
                const backendSrc = path.join(srcDir, 'backend');
                if (fs.existsSync(backendSrc)) {
                    fs.cpSync(backendSrc, path.join(installDir, 'backend'), { recursive: true, preserveTimestamps: true });
                }

                // frontend/ 从 dist/ 扁平化（和 pack.js 的 zip 结构一致）
                const feEntry = manifestObj.frontend?.entry;
                const feCss = manifestObj.frontend?.css;
                const frontendSrc = path.join(srcDir, 'frontend');
                if (fs.existsSync(frontendSrc) && (feEntry || feCss)) {
                    const feDist = path.join(frontendSrc, 'dist');
                    const feInstallDir = path.join(installDir, 'frontend');
                    // dist/ 扁平化路径是否完整可用
                    const distFlatOk =
                        (!feEntry || fs.existsSync(path.join(feDist, path.basename(feEntry)))) &&
                        (!feCss || fs.existsSync(path.join(feDist, path.basename(feCss))));
                    if (distFlatOk && fs.existsSync(feDist)) {
                        fs.mkdirSync(feInstallDir, { recursive: true });
                        if (feEntry) fs.copyFileSync(path.join(feDist, path.basename(feEntry)), path.join(feInstallDir, path.basename(feEntry)));
                        if (feCss)   fs.copyFileSync(path.join(feDist, path.basename(feCss)),   path.join(feInstallDir, path.basename(feCss)));
                    } else {
                        // fallback：没有 dist/ 时整个复制（兼容没有构建的插件）
                        fs.cpSync(frontendSrc, feInstallDir, { recursive: true, preserveTimestamps: true });
                    }
                }

                // assets/ 原样
                const assetsSrc = path.join(srcDir, 'assets');
                if (fs.existsSync(assetsSrc)) {
                    fs.cpSync(assetsSrc, path.join(installDir, 'assets'), { recursive: true, preserveTimestamps: true });
                }

                // 校验 manifest + 素材映射
                const validated = validateManifest(manifestObj);
                if (validated.error) throw new Error(validated.error);

                const now = Date.now();
                const history = [...(existingEntry?.history || [])];
                if (existingEntry && existingEntry.version !== manifestObj.version) {
                    history.unshift({
                        version: existingEntry.version,
                        installedAt: existingEntry.installedAt,
                        dir: existingEntry.dir,
                    });
                }

                const entry = {
                    id: manifestObj.id,
                    name: manifestObj.name,
                    version: manifestObj.version,
                    enabled: true,
                    installedAt: existingEntry?.installedAt || now,
                    updatedAt: now,
                    dir: installDir,
                    manifest: validated.manifest,
                    error: '',
                    history: history.slice(0, 3).filter(h => h.version !== manifestObj.version && fs.existsSync(h.dir || 'x')),
                };

                upsertEntry(entry);
                bootstrapped++;
                if (existingEntry) {
                    log('系统', `内置插件 ${manifestObj.id} ${existingEntry.version} → ${manifestObj.version} 自举升级`);
                } else {
                    log('系统', `内置插件 ${manifestObj.id}@${manifestObj.version} 自举安装成功`);
                }
            } catch (error) {
                log('错误', `内置插件 ${manifestObj.id} 自举失败：${error.message}`);
            }
        }

        // --- 2. 旧 builtin/*.zip（过渡兼容，后续可删除） ---
        const builtinDir = path.join(pluginsRoot, 'builtin');
        if (fs.existsSync(builtinDir)) {
            for (const zipFile of fs.readdirSync(builtinDir).filter(n => /\.zip$/i.test(n))) {
                const zipPath = path.join(builtinDir, zipFile);
                let manifestInZip;
                try {
                    const AdmZip = require('adm-zip');
                    const archive = new AdmZip(zipPath);
                    const manifestEntry = archive.getEntry('manifest.json');
                    if (!manifestEntry) continue;
                    manifestInZip = JSON.parse(archive.readAsText(manifestEntry));
                } catch { continue; }
                if (!manifestInZip?.id || !manifestInZip?.version) continue;

                const existing = findEntry(registry, manifestInZip.id);
                if (existing && existing.version === manifestInZip.version) continue;

                try {
                    install(fs.readFileSync(zipPath), { activate: false });
                    bootstrapped++;
                    log('系统', `内置 zip ${manifestInZip.id}@${manifestInZip.version} 自举成功（兼容旧格式）`);
                } catch (error) {
                    log('错误', `内置 zip ${manifestInZip.id} 自举失败：${error.message}`);
                }
            }
        }

        if (bootstrapped > 0) {
            log('系统', `共自举安装 ${bootstrapped} 个内置插件，等待 restoreAll() 激活`);
        }
    }

    /** 服务启动时恢复全部已启用插件（路由注册在 SPA fallback 之前由 admin.js 控制时机） */
    function restoreAll() {
        bootstrapBuiltins();
        const registry = readRegistry();
        for (const entry of registry.plugins) {
            if (entry.enabled !== true) continue;
            if (!fs.existsSync(entry.dir)) {
                entry.enabled = false;
                entry.error = '插件目录缺失，已自动停用';
                continue;
            }
            try {
                activate(entry);
            } catch (error) {
                entry.enabled = false;
                entry.error = error.message;
                log('错误', `活动插件 ${entry.id} 启动恢复失败：${error.message}`);
            }
        }
        writeRegistry(registry);
    }

    function listForApi() {
        const registry = readRegistry();
        const nowSec = Math.floor(Date.now() / 1000);
        return registry.plugins.map((entry) => {
            const live = active.get(entry.id);
            const windows = entry.manifest?.windows || {};
            const primaryWindow = windows.activity || windows[Object.keys(windows)[0]] || { startTime: 0, endTime: 0, permanent: false };
            const status = entry.enabled !== true ? 'disabled' : live
                ? (primaryWindow.permanent || primaryWindow.startTime === 0 && primaryWindow.endTime === 0 ? 'active'
                    : nowSec < primaryWindow.startTime ? 'upcoming' : nowSec > primaryWindow.endTime ? 'ended' : 'active')
                : 'error';
            return {
                id: entry.id,
                name: entry.manifest?.name || entry.name,
                description: entry.manifest?.description || '',
                version: entry.version,
                enabled: entry.enabled === true,
                error: entry.error || '',
                status,
                installedAt: entry.installedAt,
                updatedAt: entry.updatedAt,
                activityIds: entry.manifest?.activityIds || [],
                windows,
                card: entry.manifest?.card || {},
                automation: entry.manifest?.automation || [],
                frontend: {
                    entryUrl: `/plugins/${encodeURIComponent(entry.id)}/${entry.version}/${entry.manifest?.frontend?.entry || 'frontend/plugin.mjs'}`,
                    cssUrl: entry.manifest?.frontend?.css ? `/plugins/${encodeURIComponent(entry.id)}/${entry.version}/${entry.manifest.frontend.css}` : '',
                    assetPrefix: entry.manifest?.frontend?.assetPrefix || '',
                },
                gameConfig: entry.manifest?.gameConfig || null,
                history: entry.history || [],
                live: !!live,
            };
        });
    }

    /** worker 启动时按注册表下发启用插件清单 */
    function listForWorkerSync() {
        return listEnabledEntries().map(entry => ({ id: entry.id, version: entry.version, dir: entry.dir, manifest: entry.manifest }));
    }

    function listEnabledEntries() {
        return readRegistry().plugins.filter(entry => entry.enabled === true && fs.existsSync(entry.dir));
    }

    return {
        install, enable, disable, uninstall, rollback, restoreAll,
        listForApi, listForWorkerSync, broadcastToWorkers,
        isActive: pluginId => active.has(pluginId),
    };
}

module.exports = { createPluginHost };
