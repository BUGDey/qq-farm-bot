/**
 * 网关客户端（worker 侧）的状态与健康上报测试
 *
 * 这里不连真网关，只用假的 net 连接替换 `net.connect`，验证：
 *   - 在途请求会被计入健康快照（否则后台任务永远以为自己最闲）
 *   - 网关进程发来的 log / ws_error 帧会被正确接受
 *   - stopNetwork 会把挂起的请求 reject 掉，而不是让它们干等超时
 *   - reconnect 会带原 Code 重新握手（网关仍在线时能拿到 reused）
 */
const assert = require('node:assert');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { encodeFrame } = require('../src/runtime/gateway-protocol');

function loadClientWithFakeSocket() {
  const net = require('node:net');
  const originalConnect = net.connect;
  const sockets = [];

  net.connect = (path, onConnect) => {
    const sock = new EventEmitter();
    sock.path = path;
    sock.written = [];
    sock.destroyed = false;
    sock.setEncoding = () => {};
    sock.write = (chunk) => { sock.written.push(String(chunk)); return true; };
    sock.destroy = () => { sock.destroyed = true; };
    sockets.push(sock);
    setImmediate(() => { if (typeof onConnect === 'function') onConnect(); });
    return sock;
  };

  // 让模块内 `require('net')` 拿到被替换的实现
  delete require.cache[require.resolve('../src/runtime/gateway-client')];
  const { createNetwork } = require('../src/runtime/gateway-client');

  const restore = () => { net.connect = originalConnect; };
  return { createNetwork, sockets, restore };
}

function frameOf(obj) {
  return `${encodeFrame(obj)}\n`;
}

/** 让假的网关 socket 先回一次 login，业务请求才会立刻进入 pending（否则会先等登录） */
async function loginOn(sockets) {
  await new Promise(r => setTimeout(r, 20));
  const sock = sockets[sockets.length - 1];
  if (sock) sock.emit('data', frameOf({ t: 'login', userState: { gid: '1' } }));
  await new Promise(r => setTimeout(r, 20));
}

test('在途请求计入健康快照，空闲判定不再永远为真', async () => {
  process.env.FARM_GATEWAY_SOCK = 'fake-pipe';
  const { createNetwork, sockets, restore } = loadClientWithFakeSocket();
  try {
    const direct = { networkEvents: new EventEmitter(), getUserState: () => ({}), getWsErrorState: () => null };
    const net = createNetwork(direct);
    net.connect('CODE-1');

    await loginOn(sockets);
    const pendingSend = net.sendMsgAsync('gamepb.shoppb.ShopService', 'ShopInfo', Buffer.from([0x08, 0x01]), 5000);
    await new Promise(r => setTimeout(r, 30));

    const health = net.getGatewayHealth();
    assert.strictEqual(health.pending, 1, '应该有 1 个在途请求');
    assert.strictEqual(net.isGatewayIdleForLowPriority(), false, '有在途请求时不算空闲');

    // 让网关回包，请求结束
    const sock = sockets[sockets.length - 1];
    const sent = sock.written.map(line => JSON.parse(line.replace(/\n$/, '')));
    const req = sent.find(f => f.t === 'request');
    assert.ok(req, '应该发出过 request 帧');
    sock.emit('data', frameOf({ t: 'response', id: req.id, body: '' }));
    await pendingSend;

    assert.strictEqual(net.getGatewayHealth().pending, 0);
  } finally {
    delete process.env.FARM_GATEWAY_SOCK;
    restore();
  }
});

test('网关发来的 log 与 ws_error 帧被接受', async () => {
  process.env.FARM_GATEWAY_SOCK = 'fake-pipe';
  const { createNetwork, sockets, restore } = loadClientWithFakeSocket();
  try {
    const direct = { networkEvents: new EventEmitter(), getUserState: () => ({}), getWsErrorState: () => null };
    const net = createNetwork(direct);
    net.connect('CODE-2');
    await new Promise(r => setTimeout(r, 20));
    const sock = sockets[sockets.length - 1];

    // 不该抛异常
    sock.emit('data', frameOf({ t: 'log', level: 'warn', message: '网关测试日志' }));
    sock.emit('data', frameOf({ t: 'event', name: 'ws_error', payload: { code: 400, message: 'Unexpected server response: 400' } }));

    assert.deepStrictEqual(net.getWsErrorState(), {
      code: 400,
      message: 'Unexpected server response: 400',
      at: net.getWsErrorState().at,
    });
  } finally {
    delete process.env.FARM_GATEWAY_SOCK;
    restore();
  }
});

test('stopNetwork 会 reject 挂起请求而不是等超时', async () => {
  process.env.FARM_GATEWAY_SOCK = 'fake-pipe';
  const { createNetwork, sockets, restore } = loadClientWithFakeSocket();
  try {
    const direct = { networkEvents: new EventEmitter(), getUserState: () => ({}), getWsErrorState: () => null };
    const net = createNetwork(direct);
    net.connect('CODE-3');

    await loginOn(sockets);
    const pendingSend = net.sendMsgAsync('gamepb.shoppb.ShopService', 'ShopInfo', Buffer.from([0x08, 0x01]), 8000);
    await new Promise(r => setTimeout(r, 30));
    net.stopNetwork();

    await assert.rejects(pendingSend, /网关已停止/);
    assert.strictEqual(net.getGatewayHealth().pending, 0);
  } finally {
    delete process.env.FARM_GATEWAY_SOCK;
    restore();
  }
});

test('reconnect 会带原 Code 重新握手', async () => {
  process.env.FARM_GATEWAY_SOCK = 'fake-pipe';
  const { createNetwork, sockets, restore } = loadClientWithFakeSocket();
  try {
    const direct = { networkEvents: new EventEmitter(), getUserState: () => ({}), getWsErrorState: () => null };
    const net = createNetwork(direct);
    net.connect('CODE-KEEP');
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(net.reconnect(), true);
    await new Promise(r => setTimeout(r, 30));

    const sock = sockets[sockets.length - 1];
    const frames = sock.written.map(line => JSON.parse(line.replace(/\n$/, '')));
    const conn = frames.find(f => f.t === 'connect');
    assert.ok(conn, '重连后应该重新发 connect');
    assert.strictEqual(conn.code, 'CODE-KEEP', '必须复用原 Code，否则会多消耗一个凭证');
  } finally {
    delete process.env.FARM_GATEWAY_SOCK;
    restore();
  }
});