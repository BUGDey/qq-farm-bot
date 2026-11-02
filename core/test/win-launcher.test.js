'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const launcher = require('../scripts/win-launcher');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('ensureToken 生成 64 位十六进制并保持稳定', () => {
  const dir = tempDir('win-token-');
  const file = path.join(dir, 'auth', 'token');
  const first = launcher.ensureToken(file);
  assert.match(first, /^[0-9a-f]{64}$/);
  const second = launcher.ensureToken(file);
  assert.strictEqual(second, first);
  assert.strictEqual(fs.readFileSync(file, 'utf8').trim(), first);
});

test('patchPluginWhitelist 把插件名插到 qce 之后且可重复执行', () => {
  const dir = tempDir('win-whitelist-');
  const mjs = path.join(dir, 'napcat.mjs');
  fs.writeFileSync(mjs, 'const list = ["napcat-plugin-qce"];\n', 'utf8');

  const first = launcher.patchPluginWhitelist(mjs);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.changed, true);
  const patched = fs.readFileSync(mjs, 'utf8');
  assert.ok(patched.includes('"napcat-plugin-qce"'));
  assert.ok(patched.includes('"qq-miniapp-openauth"'));

  const second = launcher.patchPluginWhitelist(mjs);
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.changed, false);

  const missing = path.join(dir, 'other.mjs');
  fs.writeFileSync(missing, 'const x = [];\n', 'utf8');
  const result = launcher.patchPluginWhitelist(missing);
  assert.strictEqual(result.ok, false);
  assert.match(String(result.reason), /白名单标记/);
});

test('installOpenauthPlugin 复制插件并写入 token 与开关', () => {
  const dir = tempDir('win-install-');
  const shell = path.join(dir, 'napcat');
  fs.mkdirSync(shell, { recursive: true });
  fs.writeFileSync(path.join(shell, 'napcat.mjs'), 'const list = ["napcat-plugin-qce"];\n', 'utf8');

  const pluginSrc = path.join(dir, 'plugin-src');
  fs.mkdirSync(pluginSrc, { recursive: true });
  fs.writeFileSync(path.join(pluginSrc, 'package.json'), '{"name":"qq-miniapp-openauth"}\n', 'utf8');
  fs.writeFileSync(path.join(pluginSrc, 'index.mjs'), 'export default {};\n', 'utf8');

  const result = launcher.installOpenauthPlugin(shell, 'tok123', pluginSrc);
  assert.strictEqual(result.ok, true);
  assert.ok(fs.existsSync(path.join(shell, 'plugins', 'qq-miniapp-openauth', 'index.mjs')));

  const config = JSON.parse(
    fs.readFileSync(path.join(shell, 'config', 'plugins', 'qq-miniapp-openauth', 'config.json'), 'utf8'),
  );
  assert.strictEqual(config.token, 'tok123');

  const flags = JSON.parse(fs.readFileSync(path.join(shell, 'config', 'plugins.json'), 'utf8'));
  assert.strictEqual(flags['qq-miniapp-openauth'], true);
  assert.ok(fs.readFileSync(path.join(shell, 'napcat.mjs'), 'utf8').includes('qq-miniapp-openauth'));

  const again = launcher.installOpenauthPlugin(shell, 'tok456', pluginSrc);
  assert.strictEqual(again.ok, true);
  const config2 = JSON.parse(
    fs.readFileSync(path.join(shell, 'config', 'plugins', 'qq-miniapp-openauth', 'config.json'), 'utf8'),
  );
  assert.strictEqual(config2.token, 'tok456');
});

test('napcatEnvPairs 指向本机 6099 并带 token 文件', () => {
  const pairs = launcher.napcatEnvPairs('C:/tmp/token');
  assert.strictEqual(pairs.NAPCAT_LOGIN_ENABLED, 'true');
  assert.strictEqual(pairs.NAPCAT_WEBUI_URL, 'http://127.0.0.1:6099/api');
  assert.match(pairs.NAPCAT_OPENAUTH_URL, /qq-miniapp-openauth\/api$/);
  assert.strictEqual(pairs.NAPCAT_TOKEN_FILE, 'C:/tmp/token');
  assert.strictEqual(pairs.COMPOSE_PROFILES, '');
  assert.deepStrictEqual(launcher.napcatDisablePairs(), { NAPCAT_LOGIN_ENABLED: 'false' });
});

test('findShellDir 只在 napcat.mjs 存在时返回目录', () => {
  const dir = tempDir('win-shell-');
  const nested = path.join(dir, 'NapCat.Shell.Windows.Node', 'napcat');
  fs.mkdirSync(nested, { recursive: true });
  assert.strictEqual(launcher.findShellDir(dir), null);

  const flat = path.join(dir, 'napcat');
  fs.mkdirSync(flat, { recursive: true });
  fs.writeFileSync(path.join(flat, 'napcat.mjs'), '// x\n', 'utf8');
  assert.strictEqual(launcher.findShellDir(dir), flat);
});
