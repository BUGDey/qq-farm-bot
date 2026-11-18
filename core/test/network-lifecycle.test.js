const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const EventEmitter = require('node:events');
const networkRequire = require('node:module').createRequire(require.resolve('../src/utils/network'));

const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };

function fixture({ runtimeInit, pacing, sceneScheduling = false, sceneReply, clientVersion = sceneScheduling ? '1.17.0.3_20261117' : 'fixture', unlockedScenes = [1, 2], sceneError } = {}) {
  let now = 0;
  // Legacy tests isolate transport gate/watchdog semantics; scene integration uses a fresh real executor.
  const sceneSession = sceneScheduling
    ? require('../src/services/ranch-session').createRanchSession({ minDwellMs: 0 })
    : { run: (_service, _method, fn) => fn(), assertAllowed() {}, configure() {}, reset() {}, suspend() {}, resume() {}, adoptScene() {} };
  const tasks = new Map();
  const sockets = [];
  const logs = [];
  const debugLogs = [];
  const protoType = {
    create: value => value,
    encode: value => ({ finish: () => Buffer.from(JSON.stringify(value)) }),
    decode: bytes => JSON.parse(Buffer.from(bytes.data || bytes).toString()),
  };
  class Socket extends EventEmitter {
    static OPEN = 1;
    constructor() { super(); this.readyState = 0; this.sent = []; sockets.push(this); }
    send(bytes) {
      const request = protoType.decode(bytes);
      this.sent.push(request);
      if (sceneScheduling && request.meta.method_name === 'PlayerSceneLogin') {
        const target = protoType.decode(request.body).global_scene_id;
        queueMicrotask(() => this.reply(request, { global_scene_id: sceneReply ?? target }, target === 2 && sceneError ? { error_code: sceneError, error_message: '该场景还未解锁' } : {}));
      }
    }
    close() { this.readyState = 3; this.emit('close', 1000); }
    terminate() { this.close(); }
    reply(request, body = {}, meta = {}) {
      this.emit('message', protoType.encode({
        meta: { ...request.meta, message_type: 2, error_code: 0, ...meta },
        body: protoType.encode(body).finish(),
      }).finish());
    }
  }
  class Runtime {
    async init() { await runtimeInit?.(); this.ready = true; }
    destroy() { this.ready = false; }
    bindUser() {}
    getEncryptedInitInfo() { return 'fixture-init-token'; }
  }
  const crypto = { setRuntime() {}, encryptBuffer: async value => value };
  const scheduler = {
    setTimeoutTask: (key, delay, callback) => tasks.set(key, { delay, callback }),
    setIntervalTask: (key, delay, callback) => tasks.set(key, { delay, callback }),
    clear: key => tasks.delete(key), clearAll: () => tasks.clear(),
  };
  const stubs = {
    ws: Socket,
    '../services/logger': { createModuleLogger: () => ({ debug: (...args) => debugLogs.push(args) }) },
    '../services/ranch-session': { ranchSession: sceneSession },
    '../services/ranch-protocol': { createRanchProtocol: () => ({
      encode: (_method, value) => protoType.encode(value).finish(),
      decode: (_method, bytes) => protoType.decode(bytes),
    }) },
    'node:perf_hooks': { performance: { now: () => now } },
    'node:process': { env: { FARM_ACCOUNT_ID: 'fixture' }, exit: () => { throw new Error('unexpected exit'); } },
    '../config/config': { CONFIG: { serverUrl: 'ws://fixture', clientVersion, heartbeatInterval: 25000, tsdkAceEnabled: true } },
    '../services/ace-service': { AceService: class { start() {} stop() {} } },
    '../services/scheduler': { createScheduler: () => scheduler },
    '../services/status': { updateStatusFromLogin() {} },
    '../services/stats': {},
    '../models/store': { getDeviceProtocolForAccount: () => null },
    './proto': { types: new Proxy({}, { get: () => protoType }) },
    './utils': { toLong: x => x, toNum: Number, syncServerTime() {}, log: (...args) => logs.push(args), logWarn: (...args) => logs.push(args) },
    './request-priority': {
      ...networkRequire('./request-priority'),
      createRequestGate: options => networkRequire('./request-priority').createRequestGate({ ...options,
        sendIntervalBaseMs: 0, sendIntervalJitterMs: 0 }),
    },
    './crypto-wasm': crypto,
    './gateway-token': { createGatewayToken: () => 'fixture-token' },
    './tsdk-runtime': { TsdkRuntime: Runtime },
  };
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, Buffer, AbortController, Date: class extends Date { static now() { return now; } },
    require: name => Object.hasOwn(stubs, name) ? stubs[name] : networkRequire(name) });
  vm.runInContext(fs.readFileSync(require.resolve('../src/utils/network'), 'utf8'), context);
  const network = module.exports;
  async function login() {
    network.connect('fixture-code', () => {});
    const socket = sockets.at(-1);
    socket.readyState = Socket.OPEN;
    socket.emit('open');
    await flush();
    socket.reply(socket.sent.at(-1), { basic: { gid: 1, name: 'fixture', level: 1 }, unlocked_scene_ids: unlockedScenes });
    await flush();
    return socket;
  }
  return { network, sceneSession, tasks, sockets, logs, debugLogs, crypto, login, advance: ms => { now += ms; }, flush };
}

test('business deadline retires connection and never sends queued work on uncertain session', async () => {
  const f = fixture(); const socket = await f.login();
  const first = f.network.sendMsgAsync('fixture', 'Slow', Buffer.from('{}'));
  const second = f.network.sendMsgAsync('fixture', 'Queued', Buffer.from('{}'));
  const rejected = assert.rejects(first, /请求超时/);
  const cancelled = assert.rejects(second, /请求已中断/);
  await flush();
  assert.equal(socket.sent.filter(r => ['Slow', 'Queued'].includes(r.meta.method_name)).length, 1);
  f.advance(20000);
  const timeout = [...f.tasks].find(([key]) => key.startsWith('request_timeout_'));
  timeout[1].callback();
  await Promise.all([rejected, cancelled]);
  assert.equal(f.network.isConnected(), false);
  assert.ok(f.tasks.has('auto_reconnect'));
  assert.equal(socket.sent.some(r => r.meta.method_name === 'Queued'), false);
});

test('business RPCs serialize while heartbeat and ACE bypass the occupied slot', async () => {
  const f = fixture(); const socket = await f.login();
  const first = f.network.sendMsgAsync('fixture', 'First', Buffer.from('{}'));
  const second = f.network.sendMsgAsync('fixture', 'Second', Buffer.from('{}'));
  await flush();
  const firstRequest = socket.sent.at(-1);
  assert.equal(firstRequest.meta.method_name, 'First');
  const ace = f.network.sendMsgAsync('gamepb.acepb.AceService', 'AntiData', Buffer.from('{}'));
  const heartbeat = f.tasks.get('heartbeat_interval').callback();
  await flush();
  assert.equal(socket.sent.some(r => r.meta.method_name === 'Second'), false);
  for (const request of socket.sent.filter(r => ['AntiData', 'Heartbeat'].includes(r.meta.method_name))) socket.reply(request);
  await Promise.all([ace, heartbeat]);
  socket.reply(firstRequest); await first; await flush();
  assert.equal(socket.sent.at(-1).meta.method_name, 'Second');
  socket.reply(socket.sent.at(-1)); await second;
  f.network.stopNetwork();
});

test('sustained silence with pending work still triggers reconnect', async () => {
  const f = fixture(); await f.login();
  const pending = f.network.sendMsgAsync('fixture', 'Stuck', Buffer.from('{}'), 120000);
  const rejected = assert.rejects(pending, /请求已中断/);
  await flush();
  f.advance(59999); f.tasks.get('network_timeout_check').callback();
  assert.equal(f.network.isConnected(), true);
  f.advance(1); f.tasks.get('network_timeout_check').callback();
  await rejected;
  assert.equal(f.network.isConnected(), false);
  assert.ok(f.tasks.has('auto_reconnect'));
});

test('heartbeat has a reserved slot and its interval returns the request promise', async () => {
  const f = fixture(); const socket = await f.login();
  const requests = Array.from({ length: 9 }, (_, i) => f.network.sendMsgAsync('fixture', `Busy${i}`, Buffer.from('{}')));
  const results = Promise.allSettled(requests);
  await flush(); assert.equal(socket.sent.length, 2); // Login plus one business slot.
  const tick = f.tasks.get('heartbeat_interval');
  assert.equal(tick.delay, 25000);
  const heartbeat = tick.callback();
  await flush();
  assert.equal(socket.sent.at(-1).meta.method_name, 'Heartbeat');
  let complete = false; heartbeat.then(() => { complete = true; });
  await flush(); assert.equal(complete, false);
  socket.reply(socket.sent.at(-1)); await heartbeat;
  f.network.stopNetwork();
  assert.ok((await results).every(result => result.status === 'rejected'));
});

test('disconnect during async encoding cancels active and queued work; late encoders cannot send on new socket', async () => {
  const f = fixture(); await f.login();
  const encoders = [];
  f.crypto.encryptBuffer = value => new Promise(resolve => encoders.push(() => resolve(value)));
  const requests = Array.from({ length: 10 }, () => f.network.sendMsgAsync('fixture', 'Old', Buffer.from('{}')));
  const results = Promise.allSettled(requests);
  await flush();
  f.network.reconnect('new-fixture-code');
  const socket = f.sockets.at(-1); socket.readyState = 1;
  encoders.forEach(resolve => resolve());
  await flush();
  assert.equal(socket.sent.length, 0);
  assert.ok((await results).every(result => result.status === 'rejected'));
  f.network.stopNetwork();
});




test('scene executor integration enters ranch before AddFeed, then farm; heartbeat never changes scenes', async () => {
  const f = fixture({ sceneScheduling: true }); const socket = await f.login();
  try {
    const ranch = f.sceneSession.inRanch(() => f.network.sendMsgAsync('gamepb.homesteadpb.FeedMachineService', 'AddFeed', Buffer.from('{}')));
    await flush();
    assert.deepEqual(socket.sent.map(r => r.meta.method_name), ['PlayerLogin', 'PlayerSceneLogin', 'AddFeed']);
    assert.equal(JSON.parse(Buffer.from(socket.sent[1].body.data).toString()).global_scene_id, 2);
    assert.ok(f.debugLogs.some(([message, meta]) => message === '已进入牧场' && meta.event === 'scene_enter'));
    assert.equal(f.logs.some(([tag]) => tag === '场景调度'), false);
    const farm = f.sceneSession.inFarm(() => f.network.sendMsgAsync('gamepb.plantpb.PlantService', 'Harvest', Buffer.from('{}')));
    const heartbeat = f.tasks.get('heartbeat_interval').callback();
    await flush();
    assert.equal(socket.sent.at(-1).meta.method_name, 'Heartbeat');
    socket.reply(socket.sent.at(-1)); await heartbeat;
    assert.equal(socket.sent.some(r => r.meta.method_name === 'Harvest'), false);
    socket.reply(socket.sent.find(r => r.meta.method_name === 'AddFeed')); await ranch; await flush();
    assert.equal(socket.sent.at(-1).meta.method_name, 'Harvest');
    const entries = socket.sent.filter(r => r.meta.method_name === 'PlayerSceneLogin');
    assert.deepEqual(entries.map(r => JSON.parse(Buffer.from(r.body.data).toString()).global_scene_id), [2, 1]);
    socket.reply(socket.sent.at(-1)); await farm;
  } finally { f.network.stopNetwork(); }
});

test('mismatched scene reply prevents mutation at the actual network boundary', async () => {
  const f = fixture({ sceneScheduling: true, sceneReply: 1 }); const socket = await f.login();
  try {
    const operation = f.sceneSession.inRanch(() => f.network.sendMsgAsync('gamepb.homesteadpb.FeedMachineService', 'AddFeed', Buffer.from('{}')));
    const rejected = assert.rejects(operation, /目标场景不一致/);
    await flush(); await rejected;
    assert.equal(socket.sent.some(r => r.meta.method_name === 'AddFeed'), false);
  } finally { f.network.stopNetwork(); }
});

test('legacy Login keeps existing farm working without unsupported scene-login calls', async () => {
  const f = fixture({ sceneScheduling: true, clientVersion: '1.14.0.4_20260911' });
  const socket = await f.login();
  try {
    assert.equal(socket.sent[0].meta.method_name, 'Login');
    const rejected = assert.rejects(f.sceneSession.inRanch(() => f.network.sendMsgAsync('test.Service', 'RanchWrite', Buffer.from('{}'))), /旧版 Login/);
    await flush(); await rejected;
    const farm = f.sceneSession.inFarm(() => f.network.sendMsgAsync('test.Service', 'FarmRead', Buffer.from('{}')));
    await flush();
    assert.deepEqual(socket.sent.map(r => r.meta.method_name), ['Login', 'FarmRead']);
    socket.reply(socket.sent.at(-1)); await farm;
  } finally { f.network.stopNetwork(); }
});


test('real boundary 1045002 blocks ranch business but not subsequent farm query', async () => {
  const f = fixture({ sceneScheduling: true, sceneError: 1045002 }); const socket = await f.login();
  try {
    await assert.rejects(f.sceneSession.inRanch(() => f.network.sendMsgAsync('test.Service', 'RanchWrite', Buffer.from('{}'))), /1045002/);
    const farm = f.sceneSession.inFarm(() => f.network.sendMsgAsync('test.Service', 'FarmRead', Buffer.from('{}')));
    await flush(); socket.reply(socket.sent.at(-1)); await farm;
    assert.equal(socket.sent.some(r => r.meta.method_name === 'RanchWrite'), false);
    assert.equal(socket.sent.at(-1).meta.method_name, 'FarmRead');
  } finally { f.network.stopNetwork(); }
});

test('heartbeat timeout with no inbound traffic recovers before silence watchdog', async () => {
  const f = fixture(); await f.login();
  const heartbeat = f.tasks.get('heartbeat_interval').callback();
  await flush(); f.advance(20000);
  const timer = [...f.tasks].find(([key]) => key.startsWith('request_timeout_'));
  timer[1].callback(); await heartbeat;
  assert.equal(f.network.isConnected(), false);
  assert.ok(f.tasks.has('auto_reconnect'));
});

test('heartbeat timeout alone does not disconnect while inbound responses continue', async () => {
  const f = fixture(); const socket = await f.login();
  const heartbeat = f.tasks.get('heartbeat_interval').callback();
  await flush();
  const heartbeatRequest = socket.sent.at(-1);
  f.advance(19000);
  const fast = f.network.sendMsgAsync('fixture', 'Fast', Buffer.from('{}'));
  await flush(); socket.reply(socket.sent.at(-1)); await fast;
  f.advance(1000);
  f.tasks.get(`request_timeout_${heartbeatRequest.meta.client_seq}`).callback();
  await heartbeat;
  assert.equal(f.network.isConnected(), true);
  assert.equal(f.tasks.has('auto_reconnect'), false);
  f.network.stopNetwork();
});

test('timeout diagnostics include bounded request metadata without bodies or credentials', async () => {
  const f = fixture(); const socket = await f.login();
  for (let i = 0; i < 40; i++) {
    const request = f.network.sendMsgAsync('fixture', 'Read', Buffer.from('{"private":"secret-body"}'));
    await flush(); socket.reply(socket.sent.at(-1)); await request;
  }
  const request = f.network.sendMsgAsync('fixture', 'Stuck', Buffer.from('{"private":"secret-body"}'));
  const rejection = assert.rejects(request, /请求超时/);
  await flush(); f.advance(20000);
  [...f.tasks].find(([key]) => key.startsWith('request_timeout_'))[1].callback();
  await rejection;
  const diagnostic = f.logs.find(entry => entry[1]?.includes('请求超时: Stuck'));
  assert.ok(diagnostic);
  const meta = diagnostic[2];
  assert.equal(meta.requestTrace.length, 64);
  assert.equal(meta.requestTrace.at(-1).method, 'Stuck');
  assert.equal(meta.requestTrace.at(-1).event, 'sent');
  assert.ok(meta.requestTrace.some(item => item.event === 'response'));
  assert.equal(JSON.stringify(meta).includes('secret-body'), false);
});

test('background enrichment yields to occupied business slot and resumes when idle', async () => {
  const { runWithRequestPriority } = networkRequire('./request-priority');
  const f = fixture(); const socket = await f.login();
  const busy = f.network.sendMsgAsync('fixture', 'Busy', Buffer.from('{}'));
  await flush();
  await assert.rejects(runWithRequestPriority('background',
    () => f.network.sendMsgAsync('fixture', 'Enrichment', Buffer.from('{}'))),
    error => error.code === 'GATEWAY_BUSY');
  assert.equal(socket.sent.some(request => request.meta.method_name === 'Enrichment'), false);
  socket.reply(socket.sent.at(-1)); await busy;
  const enrichment = runWithRequestPriority('background',
    () => f.network.sendMsgAsync('fixture', 'Enrichment', Buffer.from('{}')));
  await flush(); socket.reply(socket.sent.at(-1)); await enrichment;
  f.network.stopNetwork();
});


test('login deadline retires an unready connection and remains armed for invalid account data', async () => {
  const f = fixture();
  f.network.connect('fixture-code', () => { throw Error('must not log in'); });
  const socket = f.sockets.at(-1); socket.readyState = 1; socket.emit('open'); await flush();
  assert.equal(f.tasks.get('login_timeout').delay, 10000);
  socket.reply(socket.sent[0], {}); await flush();
  assert.equal(f.tasks.has('heartbeat_interval'), false);
  assert.equal(f.tasks.has('login_timeout'), true);
  f.advance(10000); f.tasks.get('login_timeout').callback();
  assert.equal(f.network.isConnected(), false);
  assert.equal(f.tasks.has('auto_reconnect'), true);
  f.network.stopNetwork();
});

test('encoding deadline retires business connection and a late encoder cannot send', async () => {
  const f = fixture(); const socket = await f.login();
  let completeEncoding;
  f.crypto.encryptBuffer = value => new Promise(resolve => { completeEncoding = () => resolve(value); });
  const request = f.network.sendMsgAsync('fixture', 'EncodeSlow', Buffer.from('{}'));
  const rejected = assert.rejects(request, error => error.code === 'ENCODE_TIMEOUT');
  await flush(); f.advance(20000);
  [...f.tasks].find(([key]) => key.startsWith('request_timeout_'))[1].callback();
  await rejected; completeEncoding(); await flush();
  assert.equal(socket.sent.some(r => r.meta.method_name === 'EncodeSlow'), false);
  assert.equal(f.network.isConnected(), false);
  f.network.stopNetwork();
});

test('background enrichment yields to an idle but active scene lease', async () => {
  const { runWithRequestPriority } = networkRequire('./request-priority');
  const f = fixture({ sceneScheduling: true }); await f.login();
  let release;
  const batch = f.sceneSession.inRanch(() => new Promise(resolve => { release = resolve; }));
  await flush();
  await assert.rejects(runWithRequestPriority('background',
    () => f.network.sendMsgAsync('fixture', 'Enrichment', Buffer.from('{}'))),
    error => error.code === 'GATEWAY_BUSY' && error.errorType === 'gateway_busy');
  release(); await batch; f.network.stopNetwork();
});

test('reconnect resets sequence state and ignores every captured old socket callback', async () => {
  const f = fixture(); const old = await f.login();
  const callbacks = Object.fromEntries(['open', 'message', 'close', 'error'].map(name => [name, old.listeners(name)[0]]));
  // Confirm server sequence is nonzero before cleanup.
  f.network.ingestFrame(Buffer.from(JSON.stringify({ meta: { message_type: 3, server_seq: 99 } })));
  f.network.reconnect('fresh-code');
  const fresh = f.sockets.at(-1); fresh.readyState = 1; fresh.emit('open'); await flush();
  const login = fresh.sent[0];
  assert.equal(login.meta.client_seq, 1); assert.equal(login.meta.server_seq, 0);
  const logsBefore = f.logs.length;
  await callbacks.open(); callbacks.message(Buffer.from('invalid-old-frame'));
  callbacks.close(1006); callbacks.error(Error('Unexpected server response: 403'));
  assert.equal(f.logs.length, logsBefore);
  assert.equal(f.network.getWs(), fresh);
  assert.equal(f.tasks.has('auto_reconnect'), false);
  assert.equal(f.tasks.has('login_timeout'), true);
  fresh.reply(login, { basic: { gid: 1, name: 'fixture', level: 1 } }); await flush();
  assert.equal(f.tasks.has('login_timeout'), false);
  assert.equal(f.tasks.has('heartbeat_interval'), true);
  f.network.stopNetwork();
});

test('connection establishment and stalled wasm init each retain login deadline', async () => {
  let release;
  const f = fixture({ runtimeInit: () => new Promise(resolve => { release = resolve; }) });
  f.network.connect('fixture-code', () => {});
  const unopened = f.sockets.at(-1);
  assert.equal(f.tasks.get('login_timeout').delay, 10000);
  f.tasks.get('login_timeout').callback();
  assert.equal(unopened.readyState, 3);
  f.tasks.get('auto_reconnect').callback();
  const socket = f.sockets.at(-1); socket.readyState = 1; socket.emit('open'); await flush();
  assert.equal(socket.sent.length, 0);
  assert.equal(f.tasks.get('login_timeout').delay, 10000);
  f.tasks.get('login_timeout').callback();
  f.tasks.get('auto_reconnect').callback();
  const fresh = f.sockets.at(-1);
  release(); await flush();
  assert.equal(socket.sent.length, 0); assert.equal(fresh.sent.length, 0);
  assert.equal(f.network.getWs(), fresh);
  f.network.stopNetwork();
});

test('open without successful Login preserves eight-attempt retry budget', async () => {
  const f = fixture(); let failures = 0;
  f.network.networkEvents.on('reconnect_failed', () => failures++);
  f.network.connect('fixture-code', () => {});
  for (let index = 0; index < 9; index++) {
    const socket = f.sockets.at(-1); socket.readyState = 1; socket.emit('open'); await flush();
    f.tasks.get('login_timeout').callback();
    if (f.tasks.has('auto_reconnect')) f.tasks.get('auto_reconnect').callback();
  }
  assert.equal(f.sockets.length, 9);
  assert.equal(failures, 1);
  assert.equal(f.tasks.has('auto_reconnect'), false);
  f.network.stopNetwork();
});

test('successful Login restores retry budget after failed connection attempts', async () => {
  const f = fixture(); f.network.connect('fixture-code', () => {});
  f.tasks.get('login_timeout').callback();
  assert.equal(f.tasks.get('auto_reconnect').delay, 2000);
  f.tasks.get('auto_reconnect').callback();
  const socket = f.sockets.at(-1); socket.readyState = 1; socket.emit('open'); await flush();
  socket.reply(socket.sent[0], { basic: { gid: 1, name: 'fixture', level: 1 } }); await flush();
  socket.close();
  assert.equal(f.tasks.get('auto_reconnect').delay, 2000);
  f.network.stopNetwork();
});
