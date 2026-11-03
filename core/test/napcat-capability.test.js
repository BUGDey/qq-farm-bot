const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const napcatLogin = require('../src/services/napcat-login');

const KEYS = ['NAPCAT_LOGIN_ENABLED', 'NAPCAT_TOKEN', 'NAPCAT_TOKEN_FILE', 'NAPCAT_WEBUI_URL', 'NAPCAT_OPENAUTH_URL', 'NAPCAT_PLUGIN_TOKEN', 'NAPCAT_PLUGIN_TOKEN_FILE'];

function withEnv(values, run) {
  const saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, values);
  try {
    return run();
  }
  finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test('未开启扫码版时页签不显示，并说明原因', () => {
  withEnv({ NAPCAT_LOGIN_ENABLED: 'false' }, () => {
    const info = napcatLogin.capability();
    assert.equal(info.launchEnabled, false);
    assert.equal(info.enabled, false);
    assert.ok(info.reasons.some(reason => reason.includes('扫码版')), info.reasons.join('|'));
  });
});

test('开了扫码版但读不到 Token 时给出 Token 原因', () => {
  const missing = path.join(os.tmpdir(), `napcat-token-${Date.now()}-missing`);
  withEnv({
    NAPCAT_LOGIN_ENABLED: 'true',
    NAPCAT_TOKEN_FILE: missing,
    NAPCAT_WEBUI_URL: 'http://127.0.0.1:6099/api',
    NAPCAT_OPENAUTH_URL: 'http://127.0.0.1:6099/plugin/qq-miniapp-openauth/api',
  }, () => {
    const info = napcatLogin.capability();
    assert.equal(info.launchEnabled, true);
    assert.equal(info.enabled, false);
    assert.equal(info.hasToken, false);
    assert.ok(info.reasons.some(reason => reason.includes('Token')), info.reasons.join('|'));
  });
});

test('插件 Token 优先取插件自己的配置，读不到才退回 WebUI Token', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'napcat-plugin-'));
  const tokenFile = path.join(dir, 'token');
  const pluginConfig = path.join(dir, 'config.json');
  fs.writeFileSync(tokenFile, 'webui-token', 'utf8');
  fs.writeFileSync(pluginConfig, JSON.stringify({ token: 'plugin-token' }), 'utf8');
  try {
    withEnv({ NAPCAT_LOGIN_ENABLED: 'true', NAPCAT_TOKEN_FILE: tokenFile, NAPCAT_PLUGIN_TOKEN_FILE: pluginConfig }, () => {
      assert.equal(napcatLogin.pluginToken(), 'plugin-token');
    });
    withEnv({ NAPCAT_LOGIN_ENABLED: 'true', NAPCAT_TOKEN_FILE: tokenFile, NAPCAT_PLUGIN_TOKEN: 'explicit-token', NAPCAT_PLUGIN_TOKEN_FILE: pluginConfig }, () => {
      assert.equal(napcatLogin.pluginToken(), 'explicit-token');
    });
    withEnv({ NAPCAT_LOGIN_ENABLED: 'true', NAPCAT_TOKEN_FILE: tokenFile }, () => {
      assert.equal(napcatLogin.pluginToken(), 'webui-token');
    });
    const broken = path.join(dir, 'broken.json');
    fs.writeFileSync(broken, '{ not json', 'utf8');
    withEnv({ NAPCAT_LOGIN_ENABLED: 'true', NAPCAT_TOKEN_FILE: tokenFile, NAPCAT_PLUGIN_TOKEN_FILE: broken }, () => {
      assert.equal(napcatLogin.pluginToken(), 'webui-token');
    });
  }
  finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('开关、Token、地址齐全时立即可用', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'napcat-token-'));
  const tokenFile = path.join(dir, 'token');
  fs.writeFileSync(tokenFile, 'abc123', 'utf8');
  try {
    withEnv({
      NAPCAT_LOGIN_ENABLED: 'true',
      NAPCAT_TOKEN_FILE: tokenFile,
      NAPCAT_WEBUI_URL: 'http://127.0.0.1:6099/api',
      NAPCAT_OPENAUTH_URL: 'http://127.0.0.1:6099/plugin/qq-miniapp-openauth/api',
    }, () => {
      const info = napcatLogin.capability();
      assert.equal(info.launchEnabled, true);
      assert.equal(info.enabled, true);
      assert.equal(info.hasToken, true);
      assert.deepEqual(info.reasons, []);
      assert.equal(napcatLogin.isConfigured(), true);
    });
  }
  finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
