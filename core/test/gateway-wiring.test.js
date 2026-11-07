// 网关接线：包装函数必须调用「覆盖前的」直连实现，否则会自己调自己爆栈。
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyGatewayOverrides } = require('../src/runtime/gateway-wiring');

test('网关包装调用的是覆盖前的直连实现，不会自我递归', async () => {
    const calls = [];
    const target = {
        sendMsgAsync: async (service, method) => {
            calls.push(`${service}/${method}`);
            return 'direct-reply';
        },
        isConnected: () => true,
    };

    const createNetwork = (direct) => ({
        sendMsgAsync: async (service, method, body) => direct.sendMsgAsync(service, method, body),
        isConnected: () => false,
    });

    applyGatewayOverrides(target, createNetwork);

    assert.equal(target.isConnected(), false, '外层方法已被网关实现替换');
    const reply = await target.sendMsgAsync('gamepb.itempb.ItemService', 'Bag', Buffer.alloc(0));
    assert.equal(reply, 'direct-reply');
    assert.deepEqual(calls, ['gamepb.itempb.ItemService/Bag'], '直连实现只被调用一次');
});

test('直连快照不随后续覆盖而变化', () => {
    const target = { ping: () => 'original' };
    let snapshotPing = null;
    applyGatewayOverrides(target, (direct) => {
        snapshotPing = direct.ping;
        return { ping: () => 'gateway' };
    });
    assert.equal(target.ping(), 'gateway');
    assert.equal(snapshotPing(), 'original');
});