const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
const { createRanchSession, ranchSession } = require('../src/services/ranch-session');
const { loadProto, types, getRoot } = require('../src/utils/proto');
const { createRanchProtocol } = require('../src/services/ranch-protocol');
const { createScheduler } = require('../src/services/scheduler');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function networkFixture({ gateway = false, sceneReplyId, sceneErrorCode = 0 } = {}) {
    const filename = path.resolve(__dirname, '../src/utils/network.js');
    const realRequire = createRequire(filename);
    const session = createRanchSession({ minDwellMs: 0 });
    let encrypt = async body => body;
    let gatewayRpc = async () => ({ body: Buffer.alloc(0) });
    const gatewayCalls = [];
    const fakeWs = { OPEN: 1 };
    const module = { exports: {} };
    const context = { require(id) {
        if (gateway && id === 'node:process') return { ...process, env: { ...process.env, FARM_NETWORK_MODE: 'gateway' } };
        if (id === 'ws') return fakeWs;
        if (id === '../services/ranch-session') return { ranchSession: session };
        if (id === './crypto-wasm') return { encryptBuffer: body => encrypt(body), setRuntime() {} };
        if (gateway && id === '../runtime/gateway-client') return { createNetwork(direct) {
            return { ...direct, sendMsgAsync: (...args) => { gatewayCalls.push(args[1]); return gatewayRpc(...args); },
                connect: () => direct.networkEvents.emit('login'), reconnect() {}, cleanup() {}, stopNetwork() {} };
        } };
        return realRequire(id);
    }, module, exports: module.exports, console, setTimeout, clearTimeout, setInterval, clearInterval, AbortController,
    ...(gateway ? { process: { ...process, env: { ...process.env, FARM_NETWORK_MODE: 'gateway' } } } : {}) };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.fixture = { setSocket(value) { ws = value; } };', context, { filename });
    const network = module.exports;
    const calls = [];
    const protocol = createRanchProtocol();
    const socket = { readyState: 1, send(bytes) {
        const frame = types.GateMessage.decode(bytes);
        const method = frame.meta.method_name;
        calls.push(method);
        let body = Buffer.alloc(0);
        if (method === 'PlayerSceneLogin') {
            const request = protocol.rpc.PlayerSceneLogin.requestType.decode(frame.body);
            body = protocol.rpc.PlayerSceneLogin.responseType.encode({ global_scene_id: sceneReplyId ?? request.global_scene_id }).finish();
        }
        queueMicrotask(() => network.handleMessage(types.GateMessage.encode({ meta: { ...frame.meta, message_type: 2, error_code: method === 'PlayerSceneLogin' ? sceneErrorCode : 0 }, body }).finish()));
    }, removeAllListeners() {}, close() {} };
    network.fixture.setSocket(socket);
    Object.assign(network.getUserState(), { gid: 123, loginMode: 'player', unlockedSceneIds: [1, 2] });
    return { network, session, calls, gatewayCalls, setGatewayRpc: fn => { gatewayRpc = fn; }, setEncrypt: fn => { encrypt = fn; } };
}

test.before(loadProto);

test('modern login uses distinct fields and leaves ranch codecs outside main root', () => {
    const { network } = networkFixture();
    assert.equal(network.usesPlayerLogin('1.15.0.2_20261001'), true);
    assert.equal(network.usesPlayerLogin('2.0.0'), true);
    assert.equal(network.usesPlayerLogin('1.14.9'), false);
    assert.equal(network.usesPlayerLogin('custom-build'), false);
    const modern = types.PlayerLoginRequest.decode(network.buildLoginBody(null, true));
    assert.equal(modern.game_scene_id, 1);
    assert.equal(modern.device_info.sys_software, 'Windows');
    const legacy = types.LoginRequest.decode(network.buildLoginBody(null, false));
    assert.equal(legacy.scene_id, '1234567');
    assert.equal(getRoot().lookup('ranchbridge'), null);
    assert.equal(getRoot().lookup('gamepb.animalpb'), null);
    network.stopNetwork();
});

test('complete farm transaction holds lease and transition bypasses recursive run', async () => {
    const { network, session, calls } = networkFixture();
    await Promise.all([
        session.inFarm(async () => {
            await network.sendMsgAsync('test.Service', 'FarmOne', Buffer.alloc(0));
            await delay(5);
            await network.sendMsgAsync('test.Service', 'FarmTwo', Buffer.alloc(0));
        }),
        session.inRanch(() => network.sendMsgAsync('test.Service', 'RanchOne', Buffer.alloc(0))),
    ]);
    assert.deepEqual(calls, ['PlayerSceneLogin', 'FarmOne', 'FarmTwo', 'PlayerSceneLogin', 'RanchOne']);
    network.stopNetwork();
});

test('login scene list missing ranch still uses authoritative scene login', async () => {
    const { network, session, calls } = networkFixture();
    network.getUserState().unlockedSceneIds = [1];
    await session.inRanch(() => network.sendMsgAsync('test.Service', 'RanchRead', Buffer.alloc(0)));
    assert.deepEqual(calls, ['PlayerSceneLogin', 'RanchRead']);
    assert.deepEqual(Array.from(network.getUserState().unlockedSceneIds), [1, 2]);
    network.stopNetwork();
});

test('mismatched scene response never unlocks ranch or sends business RPC', async () => {
    const { network, session, calls } = networkFixture({ sceneReplyId: 1 });
    network.getUserState().unlockedSceneIds = [1];
    await assert.rejects(session.inRanch(() => network.sendMsgAsync('test.Service', 'Unsafe', Buffer.alloc(0))), /目标场景不一致/);
    assert.deepEqual(calls, ['PlayerSceneLogin']);
    assert.deepEqual(Array.from(network.getUserState().unlockedSceneIds), [1]);
    network.stopNetwork();
});

test('server scene rejection propagates without unlocking or sending business RPC', async () => {
    const { network, session, calls } = networkFixture({ sceneErrorCode: 1000020 });
    network.getUserState().unlockedSceneIds = [1];
    await assert.rejects(session.inRanch(() => network.sendMsgAsync('test.Service', 'Unsafe', Buffer.alloc(0))), /1000020/);
    assert.deepEqual(calls, ['PlayerSceneLogin']);
    assert.deepEqual(Array.from(network.getUserState().unlockedSceneIds), [1]);
    network.stopNetwork();
});

test('legacy ranch refusal sends no scene or business RPC', async () => {
    const { network, session, calls } = networkFixture();
    network.getUserState().loginMode = 'legacy';
    session.adoptScene('farm');
    await assert.rejects(session.inRanch(() => network.sendMsgAsync('test.Service', 'Unsafe', Buffer.alloc(0))), { code: 'SCENE_LOGIN_UNSUPPORTED' });
    assert.deepEqual(calls, []);
    network.stopNetwork();
});

test('cleanup cancels active encoding and queued leases before stale bytes can send', async () => {
    const { network, session, calls, setEncrypt } = networkFixture();
    session.adoptScene('farm');
    let releaseEncoding;
    setEncrypt(() => new Promise(resolve => { releaseEncoding = resolve; }));
    const active = session.inFarm(() => network.sendMsgAsync('test.Service', 'Late', Buffer.from([1])));
    const queued = session.inRanch(() => network.sendMsgAsync('test.Service', 'Never', Buffer.alloc(0)));
    const activeRejected = assert.rejects(active, /取消|中断/);
    const queuedRejected = assert.rejects(queued, { code: 'SCENE_CANCELLED' });
    for (let i = 0; i < 30 && !releaseEncoding; i++) await delay(25);
    assert.equal(typeof releaseEncoding, 'function');
    network.cleanup('test reset');
    await Promise.all([activeRejected, queuedRejected]);
    releaseEncoding(Buffer.from([1]));
    await delay(10);
    assert.deepEqual(calls, []);
    assert.equal(session.snapshot().queued, 0);
    assert.equal(session.snapshot().suspended, true);
    network.stopNetwork();
});

test('gateway farms safely, refuses ranch locally and cleanup cancels pending IPC', async () => {
    const { network, session, gatewayCalls, setGatewayRpc } = networkFixture({ gateway: true });
    network.connect();
    await network.sendMsgAsync('test.Service', 'Farm', Buffer.alloc(0));
    await assert.rejects(session.inRanch(() => network.sendMsgAsync('test.Service', 'Ranch', Buffer.alloc(0)), { manual: true }), { code: 'SCENE_LOGIN_UNSUPPORTED' });
    assert.deepEqual(gatewayCalls, ['Farm']);
    setGatewayRpc(() => new Promise(() => {}));
    const active = network.sendMsgAsync('test.Service', 'Pending', Buffer.alloc(0));
    const rejected = assert.rejects(active, /取消|中断/);
    await delay(5);
    network.cleanup();
    await rejected;
    assert.equal(session.snapshot().suspended, true);
    network.stopNetwork();
});

test('scheduler scene callback holds full lease and scene:null detaches inherited lease', async () => {
    ranchSession.reset(); ranchSession.resume(); ranchSession.adoptScene('farm');
    const scheduler = createScheduler('ranch-network-scene-test', { scene: 'farm' });
    const events = [];
    let callbackDone;
    const completed = new Promise(resolve => { callbackDone = resolve; });
    scheduler.setTimeoutTask('full', 0, async () => {
        events.push(ranchSession.snapshot().activeScene);
        await delay(5);
        events.push(ranchSession.snapshot().activeScene);
        callbackDone();
    });
    await completed;
    assert.deepEqual(events, ['farm', 'farm']);
    let detachedDone;
    const detached = new Promise(resolve => { detachedDone = resolve; });
    await ranchSession.inFarm(() => {
        scheduler.setTimeoutTask('detached', 0, async () => {
            await ranchSession.inFarm(() => events.push('fresh'));
            detachedDone();
        }, { scene: null });
    });
    await detached;
    assert.equal(events.at(-1), 'fresh');
    scheduler.dispose(); ranchSession.reset();
});

test('clearing a timer waiting on a lease and resetting an old timeout prevent callbacks', async () => {
    ranchSession.reset(); ranchSession.resume(); ranchSession.adoptScene('farm');
    const scheduler = createScheduler('ranch-network-cancel-test', { scene: 'farm' });
    let release;
    const active = ranchSession.inFarm(() => new Promise(resolve => { release = resolve; }));
    let calls = 0;
    scheduler.setTimeoutTask('queued', 0, () => { calls++; });
    await delay(5);
    assert.equal(ranchSession.snapshot().queued, 1);
    scheduler.clear('queued');
    release(); await active; await delay(5);
    assert.equal(calls, 0);
    scheduler.setTimeoutTask('old-generation', 5, () => { calls++; });
    ranchSession.reset();
    await delay(10);
    assert.equal(calls, 0);
    scheduler.dispose(); ranchSession.reset();
});
