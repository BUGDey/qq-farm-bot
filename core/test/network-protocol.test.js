const assert = require('node:assert/strict');
const test = require('node:test');

const { CONFIG, DEFAULT_CLIENT_VERSION, resolveClientVersion } = require('../src/config/config');
const { loadProto } = require('../src/utils/proto');
const { buildHeartbeatBody, buildLoginBody } = require('../src/utils/network');

// 抓包固定的是 1.15.0.2 那次会话的报文；协议字段结构不随版本变化，
// 所以断言时把 clientVersion 临时切回抓包版本，避免升级默认版本就失效。
const OFFICIAL_SESSION_VERSION = '1.15.0.2_20261001';

function withSessionVersion(version, run) {
  const previous = CONFIG.clientVersion;
  CONFIG.clientVersion = version;
  try {
    return run();
  } finally {
    CONFIG.clientVersion = previous;
  }
}

const OFFICIAL_LOGIN_BODY =
  '180022002a1c0a11312e31352e302e325f3230323631303031120757696e646f777330003a0731323334353637'
  + '42180a0012001a0022002a086f746865722d717130023a0042004a00';
const OFFICIAL_HEARTBEAT_BODY = '08f9d6ffc5041211312e31352e302e325f32303236313030311800';

test.before(async () => loadProto());

test('default client protocol is upgraded without replacing custom versions', () => {
  assert.equal(DEFAULT_CLIENT_VERSION, '1.16.3.8_20261028');
  assert.equal(resolveClientVersion('1.13.0.5_20260723'), DEFAULT_CLIENT_VERSION);
  assert.equal(resolveClientVersion('1.13.2.9_20260723'), DEFAULT_CLIENT_VERSION);
  // 低于基线（版本或日期）的统一回落到基线，更新的版本保留
  assert.equal(resolveClientVersion('1.15.0.1_20261001'), DEFAULT_CLIENT_VERSION);
  assert.equal(resolveClientVersion('1.15.0.3_20261001'), DEFAULT_CLIENT_VERSION);
  assert.equal(resolveClientVersion('1.15.1.0_20261015'), DEFAULT_CLIENT_VERSION);
  assert.equal(resolveClientVersion('1.16.1.8_20261028'), DEFAULT_CLIENT_VERSION);
  assert.equal(resolveClientVersion('1.16.4.0_20261028'), '1.16.4.0_20261028');
  assert.equal(resolveClientVersion('1.16.3.8_20261101'), '1.16.3.8_20261101');
  assert.equal(resolveClientVersion('custom-build'), 'custom-build');
});

test('default login request reproduces the 1.15.0.2 official capture', () => {
  assert.equal(withSessionVersion(OFFICIAL_SESSION_VERSION, () => buildLoginBody()).toString('hex'), OFFICIAL_LOGIN_BODY);
});

test('custom device protocol keeps its explicit fingerprint fields', () => {
  const body = buildLoginBody({
    enabled: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    deviceBrand: 'Xiaomi',
    deviceModel: 'Xiaomi 14 Ultra',
    deviceId: 'device-14-ultra',
  });
  assert.notEqual(body.toString('hex'), OFFICIAL_LOGIN_BODY);
});

test('heartbeat request reproduces the official capture', () => {
  assert.equal(
    withSessionVersion(OFFICIAL_SESSION_VERSION, () => buildHeartbeatBody(1220537209)).toString('hex'),
    OFFICIAL_HEARTBEAT_BODY,
  );
});
