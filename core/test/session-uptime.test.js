const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 临时数据目录，避免污染真实 core/data
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqfarm-uptime-'));
process.env.FARM_DATA_DIR = tmpDir;

const store = require('../src/models/store');
const { _test } = require('../src/runtime/runtime-engine');
const { applySessionUptime } = _test;

function makeAccount(name) {
  const data = store.addOrUpdateAccount({ name, loginType: 'manual' });
  const account = data.accounts.find(a => a.name === name);
  return String(account.id);
}

test('首次连接时写入 loginSince，并保留 worker 本次运行时长', () => {
  const id = makeAccount('uptime-a');
  const patched = applySessionUptime(id, { connection: { connected: true }, uptime: 0 });
  assert.equal(patched.sessionUptime, 0);
  assert.equal(patched.uptime, 0);

  const since = store.getAccountLoginSince(id);
  assert.ok(since > 0, 'loginSince 应被写入');
  assert.ok(Math.abs(Date.now() - since) < 5000, 'loginSince 应接近当前时间');
});

test('刷新 Code 重启后（worker uptime 归零）累计时长不回退', () => {
  const id = makeAccount('uptime-b');
  const oneHourAgo = Date.now() - 3600 * 1000;
  store.markAccountLogin(id, oneHourAgo);

  // 模拟重启后：worker 只跑了 10 秒
  const patched = applySessionUptime(id, { connection: { connected: true }, uptime: 10 });
  assert.equal(patched.sessionUptime, 10);
  assert.ok(patched.uptime >= 3600, `累计时长应约 1 小时，实际 ${patched.uptime}`);
  assert.ok(patched.uptime <= 3605, `累计时长不应远超 1 小时，实际 ${patched.uptime}`);

  // loginSince 不应被这次重启改写
  assert.equal(store.getAccountLoginSince(id), oneHourAgo);
});

test('未连接状态不做处理', () => {
  const id = makeAccount('uptime-c');
  const raw = { connection: { connected: false }, uptime: 0 };
  assert.equal(applySessionUptime(id, raw), raw);
  assert.equal(store.getAccountLoginSince(id), 0);
});
