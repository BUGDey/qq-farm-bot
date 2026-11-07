const test = require('node:test');
const assert = require('node:assert');

const { encodeFrame, decodeFrame, toBase64, fromBase64, splitFrames } = require('../src/runtime/gateway-protocol');
const { socketPathFor, isGatewayMode } = require('../src/runtime/gateway-manager');

test('帧编解码与二进制往返', () => {
    const frame = { t: 'request', id: 3, service: 'gamepb.plantpb.PlantService', method: 'AllLands' };
    const text = encodeFrame(frame);
    assert.ok(text.includes('\n') === false, '单帧不含换行');
    assert.deepEqual(decodeFrame(text), frame);
    assert.equal(decodeFrame('not json'), null);

    const buf = Buffer.from([0, 1, 2, 250, 255]);
    assert.deepEqual(fromBase64(toBase64(buf)), buf);
    assert.equal(toBase64(null), '');
});

test('splitFrames 正确处理半包与粘包', () => {
    const [first, rest] = splitFrames('{"t":"a"}\n{"t":"b"}\n{"t":"c"');
    assert.deepEqual(first, ['{"t":"a"}', '{"t":"b"}']);
    assert.equal(rest, '{"t":"c"');
    const [none, whole] = splitFrames('{"t":"c"}');
    assert.deepEqual(none, []);
    assert.equal(whole, '{"t":"c"}');
});

test('网关 socket 路径按账号隔离，且平台正确', () => {
    const a = socketPathFor('acc 1');
    const b = socketPathFor('acc1');
    assert.notEqual(a, b, '不同账号不能共用 socket');
    if (process.platform === 'win32') {
        assert.ok(a.includes('pipe'), a);
        assert.ok(a.includes('qqfarm-gateway-acc_1'), a);
    } else {
        assert.ok(a.endsWith('qqfarm-gateway-acc_1.sock'), a);
    }
});

test('网关模式判定只认 gateway', () => {
    assert.equal(isGatewayMode({ FARM_NETWORK_MODE: 'gateway' }), true);
    assert.equal(isGatewayMode({ FARM_NETWORK_MODE: 'GATEWAY' }), true);
    assert.equal(isGatewayMode({ FARM_NETWORK_MODE: 'direct' }), false);
    assert.equal(isGatewayMode({}), false);
});