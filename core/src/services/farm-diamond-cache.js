/**
 * 农场钻石缓存。
 *
 * 背景：牧场场景的 GetBag 不会下发钻石（道具 1004），导致牧场/面板里钻石
 * 显示为 0。农场登录与状态同步时是拿得到钻石的，这里把农场侧读到的钻石
 * 按账号持久化到 data/farm-diamond-cache.json，供牧场侧读取兜底。
 *
 * 文件结构：{ [accountId]: { diamond: Number, updatedAt: Number } }
 * 只缓存真实读到的数值；读不到时返回 null，绝不伪造 0。
 */
const { getDataFile } = require('../config/runtime-paths');
const { readJsonFile, writeJsonFileAtomic } = require('./json-db');

const CACHE_FILE = getDataFile('farm-diamond-cache.json');

function readAll() {
    const data = readJsonFile(CACHE_FILE, () => ({}));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function cacheKey(accountId) {
    const key = String(accountId || '').trim();
    return key || 'default';
}

function saveFarmDiamond(accountId, diamond) {
    const value = Number(diamond);
    if (!Number.isFinite(value) || value < 0) return null;
    const key = cacheKey(accountId);
    const all = readAll();
    const entry = { diamond: value, updatedAt: Date.now() };
    all[key] = entry;
    writeJsonFileAtomic(CACHE_FILE, all);
    return entry;
}

function readFarmDiamond(accountId) {
    const entry = readAll()[cacheKey(accountId)];
    if (!entry || !Number.isFinite(Number(entry.diamond))) return null;
    return { diamond: Number(entry.diamond), updatedAt: Number(entry.updatedAt) || 0 };
}

module.exports = { CACHE_FILE, saveFarmDiamond, readFarmDiamond };
