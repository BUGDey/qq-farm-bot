/**
 * 游戏侧 open_id 收集器。
 *
 * 背景：NapCat 只能给 QQ 号，拿不到 open_id；而游戏好友的锚点是 open_id。
 * 但游戏自己的回包里常常带 open_id（好友列表的 GameFriend.open_id、进好友农场的 BasicInfo.open_id），
 * 把这些攒起来再交给 `SyncAll`，就能自动把 GID 补齐，不需要人工粘贴。
 */
const fs = require('fs');
const path = require('path');

const STORE_FILE = process.env.QQFARM_FRIEND_OPENIDS_FILE
  || path.join(__dirname, '..', '..', 'data', 'friend-openids.json');
const MAX_IDS = 5000;

let cache = null;
let writeTimer = null;

function load() {
  if (cache) return cache;
  cache = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    for (const item of Array.isArray(raw) ? raw : raw?.items || []) {
      const id = String(item?.openId || item || '').trim().toUpperCase();
      if (id) cache.set(id, String(item?.name || ''));
    }
  } catch {
    // 文件不存在或损坏都当空的
  }
  return cache;
}

function flush() {
  writeTimer = null;
  try {
    const items = [...load().entries()].map(([openId, name]) => ({ openId, name }));
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(items, null, 0), 'utf8');
  } catch {
    // 写不进去就算了，内存里还有
  }
}

function scheduleFlush() {
  if (writeTimer) return;
  writeTimer = setTimeout(flush, 2000);
  if (typeof writeTimer.unref === 'function') writeTimer.unref();
}

/** 攒 open_id：好友列表 / 农场回包里捞到的都塞进来。 */
function rememberOpenIds(entries) {
  const store = load();
  let added = 0;
  const list = Array.isArray(entries) ? entries : [entries];
  for (const entry of list) {
    const raw = typeof entry === 'string' ? entry : entry && (entry.openId || entry.open_id || entry.openid);
    const name = (entry && typeof entry === 'object' && (entry.name || entry.nick || '')) || '';
    const id = String(raw || '').trim().toUpperCase();
    if (!/^[0-9A-F]{8,64}$/.test(id)) continue;
    if (!store.has(id)) added += 1;
    store.set(id, name || store.get(id) || '');
    if (store.size >= MAX_IDS) break;
  }
  if (added > 0) scheduleFlush();
  return added;
}

/** 从一个好友对象数组里收集（GameFriend 用的是 open_id 字段）。 */
function harvestFromFriends(friends) {
  return rememberOpenIds(Array.isArray(friends) ? friends : []);
}

function getOpenIds() {
  return [...load().keys()];
}

function getCount() {
  return load().size;
}

module.exports = {
  STORE_FILE,
  rememberOpenIds,
  harvestFromFriends,
  getOpenIds,
  getCount,
};