const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createMaintenance, fileTransport, watchNapcatRequests } = require('../src/services/napcat-maintenance');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'napcat-maintenance-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const transport = fileTransport(dir);
  let now = 1;
  const state = { active: false, draining: false, ready: true, invalidations: 0 };
  const login = {
    beginMaintenance() { state.draining = true; },
    endMaintenance() { state.draining = false; },
    invalidateForMaintenance() { state.invalidations++; },
    hasActiveTasks: () => state.active,
    maintenanceReady: () => state.ready,
  };
  const clock = { now: () => now, advance: ms => { now += ms; } };
  transport.acknowledge('', clock.now());
  const scheduler = createMaintenance({ login, transport, ...clock, intervalMs: 300, maxWaitMs: 100, retryMs: 20 });
  return { transport, state, clock, scheduler };
}

test('maintenance drains old scans until idle and waits for a matching startup ack and readiness', async t => {
  const { transport, state, clock, scheduler } = fixture(t);
  state.active = true;
  await scheduler.tick();
  clock.advance(299);
  await scheduler.tick();
  assert.equal(state.draining, false);
  clock.advance(1);
  await scheduler.tick();
  assert.equal(state.draining, true);
  assert.equal(transport.readRequest(), '');
  state.active = false;
  await scheduler.tick();
  const nonce = transport.readRequest();
  assert.match(nonce, /^[a-f0-9]{48}$/);
  transport.acknowledge('other', clock.now());
  await scheduler.tick();
  assert.equal(state.draining, true);
  transport.acknowledge(nonce, clock.now());
  state.ready = false;
  await scheduler.tick();
  clock.advance(20);
  state.ready = true;
  await scheduler.tick();
  assert.equal(state.draining, false);
  assert.equal(scheduler.state().nextAt, 601);
  assert.equal(state.invalidations, 1);
});

test('an active scan is invalidated at the deadline and a pending restart is not reissued', async t => {
  const { transport, state, clock, scheduler } = fixture(t);
  state.active = true;
  clock.advance(300);
  await scheduler.tick();
  clock.advance(99);
  await scheduler.tick();
  assert.equal(transport.readRequest(), '');
  clock.advance(1);
  await scheduler.tick();
  const nonce = transport.readRequest();
  assert.ok(nonce);
  clock.advance(2000);
  await scheduler.tick();
  assert.equal(transport.readRequest(), nonce);
  assert.equal(state.invalidations, 1);
  scheduler.stop();
  assert.equal(state.draining, false);
});

test('Windows watcher serializes requests, backs off after failure and acknowledges only successful restarts', async t => {
  const { transport, clock } = fixture(t);
  let calls = 0;
  let resolve;
  const watcher = watchNapcatRequests({ transport, ...clock, retryMs: 20, restart: async () => {
    if (++calls === 1) throw new Error('mock stop failure');
    await new Promise(done => { resolve = done; });
  } });
  const nonce = 'a'.repeat(48);
  transport.request(nonce);
  await watcher.tick();
  await watcher.tick();
  assert.equal(calls, 1);
  assert.notEqual(transport.readAck().nonce, nonce);
  clock.advance(20);
  const attempt = watcher.tick();
  await watcher.tick();
  assert.equal(calls, 2);
  resolve();
  await attempt;
  await watcher.tick();
  assert.deepEqual(transport.readAck(), { nonce, startedAt: 21 });
  assert.equal(calls, 2);
});

test('forced maintenance invalidates a create before its task is registered', async t => {
  const login = require('../src/services/napcat-login');
  const saved = global.fetch;
  const keys = ['NAPCAT_LOGIN_ENABLED', 'NAPCAT_TOKEN', 'NAPCAT_TOKEN_FILE'];
  const prior = keys.map(key => process.env[key]);
  Object.assign(process.env, { NAPCAT_LOGIN_ENABLED: 'true', NAPCAT_TOKEN: 'test', NAPCAT_TOKEN_FILE: 'nonexistent-test-token' });
  t.after(() => {
    global.fetch = saved;
    keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; });
    login.endMaintenance();
  });
  let complete;
  global.fetch = () => new Promise(resolve => { complete = resolve; });
  const first = login.create('owner');
  assert.equal(login.hasActiveTasks(), true);
  login.beginMaintenance();
  await assert.rejects(login.create('another'), /自动维护/);
  login.invalidateForMaintenance();
  complete({ ok: true, text: async () => JSON.stringify({ data: { Credential: 'old' } }) });
  await assert.rejects(first, /自动维护/);
  assert.equal(login.hasActiveTasks(), false);
});
