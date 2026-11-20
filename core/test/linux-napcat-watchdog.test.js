'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { findPidFile, looksLikeNapcat, protectedPids, stopNapcat, createRestart } = require('../scripts/linux-napcat-watchdog');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'napcat-linux-watchdog-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('protected PIDs always include PID 1, self and parent', () => {
  const set = protectedPids('42, 43');
  assert.equal(set.has(1), true);
  assert.equal(set.has(process.pid), true);
  assert.equal(set.has(process.ppid), true);
  assert.equal(set.has(42), true);
  assert.equal(set.has(43), true);
  assert.equal(set.has(999999), false);
});

test('PID discovery prefers the explicit file and ignores junk values', (t) => {
  const dir = tempDir(t);
  const explicit = path.join(dir, 'explicit.pid');
  fs.writeFileSync(explicit, ' 4242\n');
  assert.deepEqual(findPidFile({ explicit, maintenanceDir: dir }), { pid: 4242, file: explicit });
  fs.writeFileSync(explicit, 'not-a-pid');
  assert.equal(findPidFile({ explicit, maintenanceDir: dir }), null);
});

test('stop refuses unknown, protected and non-NapCat PIDs without signaling anything', async (t) => {
  const dir = tempDir(t);
  const pidFile = { explicit: path.join(dir, 'napcat.pid') };
  const signals = [];
  const kill = (pid, signal) => { signals.push([pid, signal]); };
  await assert.rejects(stopNapcat({ pidFile, kill, looksLike: () => true }), /未找到 NapCat PID/);
  fs.writeFileSync(pidFile.explicit, String(process.pid));
  await assert.rejects(stopNapcat({ pidFile, kill, looksLike: () => true }), /受保护进程/);
  fs.writeFileSync(pidFile.explicit, '4243');
  await assert.rejects(stopNapcat({ pidFile, kill, looksLike: () => false }), /不像 NapCat/);
  assert.deepEqual(signals, []);
});

test('stop terminates only the verified NapCat PID and escalates when it survives', async (t) => {
  const dir = tempDir(t);
  const explicit = path.join(dir, 'napcat.pid');
  fs.writeFileSync(explicit, '4244');
  const signals = [];
  let alive = true;
  const kill = (pid, signal) => {
    signals.push([pid, signal]);
    if (signal === 'SIGKILL') alive = false;
  };
  await stopNapcat({ pidFile: { explicit }, kill, looksLike: () => true, wait: async () => {}, isAlive: () => { if (!alive) throw new Error('gone'); return true; } });
  assert.deepEqual(signals, [[4244, 'SIGTERM'], [4244, 'SIGKILL']]);
});

test('restart requires a start command so a running NapCat is never killed without replacement', async () => {
  const restart = createRestart({ startCommand: '' });
  await assert.rejects(restart(), /未配置 NAPCAT_LINUX_START_CMD/);
  const missing = createRestart({});
  await assert.rejects(missing(), /未配置 NAPCAT_LINUX_START_CMD/);
});

test('looksLikeNapcat rejects PIDs that cannot be inspected', () => {
  assert.equal(looksLikeNapcat(-1), false);
  assert.equal(looksLikeNapcat(2147483647), false);
});
