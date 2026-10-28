/**
 * 插件注册表（data/plugins/registry.json）。
 *
 * 注册表是插件安装状态的唯一事实源：主进程、worker 进程、前端都从这里
 * 读取已安装插件的清单与版本。文件结构：
 * { version: 1, plugins: [{ id, name, version, enabled, installedAt, updatedAt,
 *                           dir, manifest, error, history: [{version, installedAt}] }] }
 */

const fs = require('node:fs');
const path = require('node:path');
const { getDataFile } = require('../config/runtime-paths');

const REGISTRY_VERSION = 1;

function getRegistryFile() {
    // getDataFile 只接受单参数（拼接到数据目录），插件子路径需再用 path.join
    return path.join(getDataFile('plugins'), 'registry.json');
}

function getPluginsRoot() {
    return path.dirname(getRegistryFile());
}

function getPluginInstallDir(pluginId) {
    return path.join(getPluginsRoot(), 'installed', pluginId);
}

function readRegistry() {
    migrateLegacyRegistryFile();
    const file = getRegistryFile();
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (raw && Array.isArray(raw.plugins)) return raw;
    } catch {
        // 文件不存在或损坏时从空注册表开始
    }
    return { version: REGISTRY_VERSION, plugins: [] };
}

/**
 * 兼容修复：历史缺陷曾把注册表原子写成 data/plugins 文件（而非目录下的
 * registry.json）。存在旧布局文件时迁移到目录布局，避免启动时 mkdir EEXIST。
 */
function migrateLegacyRegistryFile() {
    const legacyPath = getDataFile('plugins');
    try {
        if (!fs.existsSync(legacyPath) || !fs.statSync(legacyPath).isFile()) return;
        const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        if (!legacy || !Array.isArray(legacy.plugins)) {
            fs.rmSync(legacyPath, { force: true });
            return;
        }
        const plugins = legacy.plugins;
        fs.rmSync(legacyPath, { force: true });
        fs.mkdirSync(path.dirname(getRegistryFile()), { recursive: true });
        writeRegistry({ version: REGISTRY_VERSION, plugins });
    } catch {
        // 迁移失败按无注册表处理，不阻塞启动
    }
}

function writeRegistry(registry) {
    const file = getRegistryFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const payload = { ...registry, version: REGISTRY_VERSION, updatedAt: new Date().toISOString() };
    // 原子写：先写临时文件再 rename，避免进程中断留下损坏的注册表
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return payload;
}

function findEntry(registry, pluginId) {
    return (registry.plugins || []).find(entry => entry.id === pluginId) || null;
}

function upsertEntry(entry) {
    const registry = readRegistry();
    const index = registry.plugins.findIndex(item => item.id === entry.id);
    if (index >= 0) registry.plugins[index] = entry;
    else registry.plugins.push(entry);
    writeRegistry(registry);
    return entry;
}

function removeEntry(pluginId) {
    const registry = readRegistry();
    registry.plugins = registry.plugins.filter(item => item.id !== pluginId);
    writeRegistry(registry);
}

/** 列出所有启用的插件（供 worker 同步与自动化注册表使用） */
function listEnabled() {
    return readRegistry().plugins.filter(entry => entry.enabled === true);
}

module.exports = {
    REGISTRY_VERSION,
    getRegistryFile,
    getPluginsRoot,
    getPluginInstallDir,
    readRegistry,
    writeRegistry,
    findEntry,
    upsertEntry,
    removeEntry,
    listEnabled,
};
