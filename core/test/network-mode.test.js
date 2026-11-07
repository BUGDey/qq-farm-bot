// 连接网关开关：全局设置里保存的模式要能被 store 持久化，并被网关管理器读到。
// 用临时数据目录，避免碰真实 store.json。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqfarm-netmode-'));
process.env.FARM_DATA_DIR = dataDir;
delete process.env.FARM_NETWORK_MODE;

const store = require('../src/models/store');
const gatewayManager = require('../src/runtime/gateway-manager');

test('默认是直连模式', () => {
    assert.equal(store.getNetworkMode(), 'direct');
    assert.equal(gatewayManager.isGatewayMode({}), false);
});

test('保存网关模式后写进 store.json，网关判定随之变化', () => {
    assert.equal(store.setNetworkMode('gateway'), 'gateway');
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'store.json'), 'utf8'));
    assert.equal(saved.networkMode, 'gateway');
    assert.equal(gatewayManager.isGatewayMode({}), true);
});

test('非法值回落直连，环境变量优先于设置', () => {
    assert.equal(store.setNetworkMode('whatever'), 'direct');
    assert.equal(store.getNetworkMode(), 'direct');
    assert.equal(gatewayManager.isGatewayMode({ FARM_NETWORK_MODE: 'gateway' }), true);
    assert.equal(gatewayManager.isGatewayMode({ FARM_NETWORK_MODE: 'direct' }), false);
});