'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { loadProto, types } = require('../src/utils/proto');
const { createRanchProtocol } = require('../src/services/ranch-protocol');
const { createRanchSession } = require('../src/services/ranch-session');

// Sanitized evidence from gate-obt HAR 2026-11-17 11:00:39 (3107 frames):
// seq5 har12/17: request 0801, reply f1=1/f10, followed by PlantService.AllLands.
// seq43 har92/94: request 0802, reply f1=2/f11, followed by Homestead/Animal RPCs.
// Only the scene request bytes are retained; no account or response payload data.
function fixture(errorCode = 0) {
    const filename = path.resolve(__dirname, '../src/utils/network.js');
    const realRequire = createRequire(filename);
    const session = createRanchSession({ minDwellMs: 0 });
    const module = { exports: {} };
    const context = {
        require(id) {
            if (id === 'node:process') return { ...process, env: { ...process.env, FARM_NETWORK_MODE: 'direct' } };
            if (id === 'ws') return { OPEN: 1 };
            if (id === '../services/ranch-session') return { ranchSession: session };
            if (id === './crypto-wasm') return { encryptBuffer: async body => body, setRuntime() {} };
            return realRequire(id);
        },
        module, exports: module.exports, console, setTimeout, clearTimeout, setInterval, clearInterval, AbortController,
    };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.setTestSocket = value => { ws = value; };', context, { filename });
    const network = module.exports;
    const protocol = createRanchProtocol();
    const calls = [];
    network.setTestSocket({ readyState: 1, send(bytes) {
        const frame = types.GateMessage.decode(bytes);
        const method = frame.meta.method_name;
        calls.push({ method, body: Buffer.from(frame.body).toString('hex') });
        const isScene = method === 'PlayerSceneLogin';
        const id = isScene ? protocol.rpc.PlayerSceneLogin.requestType.decode(frame.body).global_scene_id : 0;
        const body = isScene ? protocol.rpc.PlayerSceneLogin.responseType.encode({ global_scene_id: id }).finish() : Buffer.alloc(0);
        queueMicrotask(() => network.handleMessage(types.GateMessage.encode({
            meta: { ...frame.meta, message_type: 2, error_code: isScene ? errorCode : 0 }, body,
        }).finish()));
    }, removeAllListeners() {}, close() {} });
    Object.assign(network.getUserState(), { gid: 123, loginMode: 'player', unlockedSceneIds: [1] });
    return { network, session, calls };
}

test.before(loadProto);

test('network scene transitions reproduce official farm 0801 and ranch 0802 requests', async () => {
    const { network, session, calls } = fixture();
    try {
        await session.inFarm(() => network.sendMsgAsync('test.Service', 'FarmRead', Buffer.alloc(0)));
        await session.inRanch(() => network.sendMsgAsync('test.Service', 'RanchRead', Buffer.alloc(0)));
        assert.deepEqual(calls.filter(call => call.method === 'PlayerSceneLogin').map(call => call.body), ['0801', '0802']);
        assert.deepEqual(Array.from(network.getUserState().unlockedSceneIds), [1, 2]);
    } finally { network.stopNetwork(); }
});

test('server 1045002 remains authoritative and prevents ranch business requests', async () => {
    const { network, session, calls } = fixture(1045002);
    try {
        await assert.rejects(session.inRanch(() => network.sendMsgAsync('test.Service', 'RanchRead', Buffer.alloc(0))), /1045002/);
        assert.deepEqual(calls, [{ method: 'PlayerSceneLogin', body: '0802' }]);
        assert.deepEqual(Array.from(network.getUserState().unlockedSceneIds), [1]);
    } finally { network.stopNetwork(); }
});
