const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// 关键：先把数据目录指到临时目录，再 require store / engine，避免碰到真实账号数据
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-uptime-'));
process.env.FARM_DATA_DIR = tmpDir;
fs.writeFileSync(
  path.join(tmpDir, 'accounts.json'),
  JSON.stringify({
    accounts: [
      { id: '1', name: 'a', platform: 'qq', qq: '10001', username: 'admin' },
      { id: '2', name: 'b', platform: 'qq', qq: '10002', username: 'admin' },
      { id: '3', name: 'c', platform: 'qq', qq: '10003', username: 'admin' },
      { id: '4', name: 'd', platform: 'qq', qq: '10004', username: 'admin' },
    ],
    nextId: 5,
  }, null, 2),
  'utf8',
);

const engine = require('../src/runtime/runtime-engine');
const { applySessionUptime } = engine._test;
const store = require('../src/models/store');

function baseStatus(uptime) {
  return { connected: true, connection: { connected: true }, uptime };
}

test('首次观测登录：无锚点时以当前时刻起算，不做时长久跳变', () => {
  store.clearAccountLogin('1');
  const out = applySessionUptime('1', baseStatus(0));
  assert.ok(out.uptime >= 0 && out.uptime <= 2, `uptime=${out.uptime}`);
  assert.ok(store.getAccountLoginSince('1') > 0);
});

test('锚点保留时继续累计，worker 重启归零不影响已运行时长', () => {
  store.markAccountLogin('2', Date.now() - 3600 * 1000);
  const out = applySessionUptime('2', baseStatus(0));
  assert.ok(out.uptime >= 3599 && out.uptime <= 3610, `uptime=${out.uptime}`);
  assert.strictEqual(out.sessionUptime, 0);
});

test('锚点被清零后不会因 worker 仍在运行而跳回旧时长', () => {
  store.markAccountLogin('3', Date.now() - 3600 * 1000);
  store.clearAccountLogin('3');
  // worker 已运行 1 小时（旧会话），但锚点刚被清：应重新从 0 起算
  const out = applySessionUptime('3', baseStatus(3600));
  assert.ok(out.uptime <= 2, `uptime=${out.uptime}`);
  assert.strictEqual(out.sessionUptime, 3600);
});

test('未连接时原样返回，不建立锚点', () => {
  store.clearAccountLogin('4');
  const status = { connected: false, uptime: 5 };
  const out = applySessionUptime('4', status);
  assert.strictEqual(out, status);
  assert.strictEqual(store.getAccountLoginSince('4'), 0);
});