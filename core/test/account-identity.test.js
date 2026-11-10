const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function loadIdentityModule(dataDir) {
  process.env.FARM_DATA_DIR = dataDir;
  const modulePath = require.resolve('../src/services/account-identity');
  delete require.cache[modulePath];
  return require('../src/services/account-identity');
}

function tempDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqfarm-identity-'));
  fs.mkdirSync(path.join(dir, 'stats'), { recursive: true });
  return dir;
}

test('身份标识：QQ 用 uin、微信优先 openId，取不到返回空串', () => {
  const dir = tempDataDir();
  const identity = loadIdentityModule(dir);

  assert.strictEqual(identity.identityOf({ platform: 'qq', uin: '10001000' }), 'qq:10001000');
  assert.strictEqual(identity.identityOf({ platform: 'qq', qq: '12345' }), 'qq:12345');
  assert.strictEqual(identity.identityOf({ platform: 'wx', openId: 'AbC123' }), 'wx:abc123');
  assert.strictEqual(identity.identityOf({ platform: 'wx', wxid: 'wx_9' }), 'wx:wx_9');
  assert.strictEqual(identity.identityOf({ platform: 'qq' }), '');
  assert.strictEqual(identity.identityOf(null), '');
});

test('删号后重新登录：旧 id 的统计会被接到新 id 上', () => {
  const dir = tempDataDir();
  const identity = loadIdentityModule(dir);
  const statsDir = path.join(dir, 'stats');

  // 老账号 3 有一份统计，索引里记着它对应这个 QQ 号
  fs.writeFileSync(path.join(statsDir, '3.json'), JSON.stringify({ savedAt: 1, rank: { daily: { steal: 5, earn: 100 } } }));
  fs.writeFileSync(path.join(statsDir, '_identities.json'), JSON.stringify({
    'qq:10001000': { accountId: '3', name: '测试账号', platform: 'qq', updatedAt: 1 },
  }));

  // 删号后重新登录，拿到新 id 9
  const result = identity.reattachStats({ id: 9, platform: 'qq', uin: '10001000', name: '测试账号' });
  assert.strictEqual(result.moved, true);
  assert.strictEqual(result.fromAccountId, '3');
  assert.ok(fs.existsSync(path.join(statsDir, '9.json')), '统计应迁移到新 id');
  assert.ok(!fs.existsSync(path.join(statsDir, '3.json')), '旧文件应被移走，避免排行榜出现幽灵行');

  const moved = JSON.parse(fs.readFileSync(path.join(statsDir, '9.json'), 'utf8'));
  assert.strictEqual(moved.rank.daily.steal, 5);

  const index = JSON.parse(fs.readFileSync(path.join(statsDir, '_identities.json'), 'utf8'));
  assert.strictEqual(index['qq:10001000'].accountId, '9');
});

test('没有历史记录时只登记身份，不碰统计文件', () => {
  const dir = tempDataDir();
  const identity = loadIdentityModule(dir);

  const result = identity.reattachStats({ id: 12, platform: 'wx', openId: 'OpenX', name: '小号' });
  assert.strictEqual(result.moved, false);
  assert.strictEqual(result.key, 'wx:openx');
  assert.ok(fs.existsSync(path.join(dir, 'stats', '_identities.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'stats', '12.json')));
});