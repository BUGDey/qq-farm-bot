/**
 * 网关客户端：登录前闸门
 *
 * 背景：worker 起来后会立刻拉好友、商店等业务接口，而网关进程此时往往
 * 还没跟游戏服务器登录完成，直接转发只会拿到「连接未打开: Xxx」，
 * 业务层把它当失败一路重试，最后还会误判掉线。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const { createNetwork } = require('../src/runtime/gateway-client');

function fakeDirect() {
    const networkEvents = new EventEmitter();
    return {
        networkEvents,
        getUserState: () => ({ gid: 0 }),
        getWsErrorState: () => ({}),
        isConnected: () => false,
    };
}

test('登录前发业务请求会先等，而不是直接报连接未打开', async () => {
    const saved = process.env.FARM_GATEWAY_SOCK;
    process.env.FARM_GATEWAY_SOCK = '';
    try {
        const direct = fakeDirect();
        const net = createNetwork(direct);
        const startedAt = Date.now();
        await assert.rejects(
            () => net.sendMsgAsync('gamepb.itempb.ItemService', 'Bag', Buffer.alloc(0), 2000),
            /网关模式缺少 FARM_GATEWAY_SOCK/,
        );
        const waited = Date.now() - startedAt;
        assert.ok(waited >= 1200, `应当先等登录信号再发请求，实际只等了 ${waited}ms`);
    } finally {
        if (saved === undefined) delete process.env.FARM_GATEWAY_SOCK;
        else process.env.FARM_GATEWAY_SOCK = saved;
    }
});

test('网关把 login 帧发回来后，业务事件能传到业务模块订阅的那个 emitter 上', () => {
    const direct = fakeDirect();
    const net = createNetwork(direct);
    let received = null;
    direct.networkEvents.once('login', (state) => { received = state; });
    assert.strictEqual(net.networkEvents, direct.networkEvents, '必须复用直连的 emitter');
    net.networkEvents.emit('login', { gid: 123 });
    assert.deepStrictEqual(received, { gid: 123 });
});