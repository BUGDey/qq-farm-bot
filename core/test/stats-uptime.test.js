const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-farm-stats-uptime-'));
process.env.FARM_DATA_DIR = dataDir;

const { getStats } = require('../src/services/stats');

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('status uptime follows the current account runtime when provided', () => {
  const stats = getStats({}, {}, false, {}, 3725);
  assert.equal(stats.uptime, 3725);
});

test('status uptime is zero when the account has not started running', () => {
  const stats = getStats({}, {}, false, {}, 0);
  assert.equal(stats.uptime, 0);
});

test('status uptime falls back to process uptime for legacy callers', () => {
  const stats = getStats({}, {}, false, {});
  assert.ok(Number.isFinite(stats.uptime));
  assert.ok(stats.uptime >= 0);
});
