/**
 * 账号身份标识：把「同一台游戏账号」在删号重登后认回来。
 *
 * QQ 用 uin、微信端用 openId/wxid，拼成 `qq:10001000` / `wx:xxx`。
 * 这类标识不会因为重新登录、换设备而改变，可以当作「这台游戏账号归谁」的凭据：
 * 用户删掉账号再加回来时，排行榜等按账号 id 累积的数据可以挂回同一个身份。
 */
const fs = require('node:fs');
const path = require('node:path');

function dataDir() {
  return process.env.FARM_DATA_DIR || path.join(__dirname, '../../data');
}

function statsDir() {
  return path.join(dataDir(), 'stats');
}

function indexFile() {
  return path.join(statsDir(), '_identities.json');
}

function statsFile(accountId) {
  return path.join(statsDir(), `${String(accountId || '')}.json`);
}

/** 从账号记录里取身份标识，取不到返回空串 */
function identityOf(account) {
  if (!account || typeof account !== 'object') return '';
  const platform = String(account.platform || 'qq').toLowerCase();
  const raw = platform === 'wx'
    ? (account.openId || account.open_id || account.wxid || '')
    : (account.uin || account.qq || '');
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return '';
  return `${platform}:${value}`;
}

function readIndex() {
  try {
    const text = fs.readFileSync(indexFile(), 'utf8');
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeIndex(index) {
  try {
    fs.mkdirSync(statsDir(), { recursive: true });
    fs.writeFileSync(indexFile(), JSON.stringify(index, null, 2));
  } catch { /* 读写失败不影响主流程 */ }
}

/** 记住「这个身份最后一次对应哪个账号 id」 */
function rememberAccount(account) {
  const key = identityOf(account);
  if (!key || !account.id) return '';
  const index = readIndex();
  index[key] = {
    accountId: String(account.id),
    name: String(account.name || ''),
    avatar: String(account.avatar || ''),
    platform: String(account.platform || 'qq'),
    updatedAt: Date.now(),
  };
  writeIndex(index);
  return key;
}

/**
 * 新建/更新账号时调用：如果这个身份以前对应过另一个账号 id（删号重登），
 * 就把那边的统计数据接过来，避免历史记录变成孤儿（排行榜里的匿名幽灵）。
 * @returns {{key: string, moved: boolean, fromAccountId: string}}
 */
function reattachStats(account) {
  const key = identityOf(account);
  if (!key || !account || !account.id) return { key: '', moved: false, fromAccountId: '' };

  const index = readIndex();
  const previous = index[key];
  let moved = false;
  let fromAccountId = '';

  if (previous && previous.accountId && String(previous.accountId) !== String(account.id)) {
    const from = statsFile(previous.accountId);
    const to = statsFile(account.id);
    fromAccountId = String(previous.accountId);
    try {
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.mkdirSync(statsDir(), { recursive: true });
        fs.renameSync(from, to);
        moved = true;
      }
    } catch { /* 迁移失败就保留原文件，不影响账号创建 */ }
  }

  rememberAccount(account);
  return { key, moved, fromAccountId };
}

module.exports = {
  identityOf,
  rememberAccount,
  reattachStats,
  readIndex,
  indexFile,
  statsFile,
};