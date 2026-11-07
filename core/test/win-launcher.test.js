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

test('shellDownloadUrls 优先自定义源并包含镜像回退', () => {
  const saved = process.env.FARM_NAPCAT_SHELL_URL;
  process.env.FARM_NAPCAT_SHELL_URL = 'https://example.com/napcat.zip';
  try {
    const urls = launcher.shellDownloadUrls();
    assert.strictEqual(urls[0], 'https://example.com/napcat.zip');
    assert.ok(
      urls.some(
        (u) =>
          u.includes('github.com/NapNeko/NapCatQQ/releases/download/') &&
          u.endsWith('NapCat.Shell.Windows.Node.zip'),
      ),
    );
    assert.ok(urls.some((u) => u.startsWith('https://ghproxy.net/')));
    // gh-proxy.org 家族（含 v4/v6/cdn/axisnow）与 akams 站点里的节点都应在候选表里
    assert.ok(urls.some((u) => u.startsWith('https://gh-proxy.org/')));
    assert.ok(urls.some((u) => u.startsWith('https://v4.gh-proxy.org/')));
    assert.ok(urls.some((u) => u.startsWith('https://v6.gh-proxy.org/')));
    assert.ok(urls.some((u) => u.startsWith('https://cdn.gh-proxy.org/')));
    assert.ok(urls.some((u) => u.startsWith('https://axisnow.gh-proxy.org/')));
    assert.ok(urls.some((u) => u.startsWith('https://gh.dpik.top/')));
  } finally {
    delete process.env.FARM_NAPCAT_SHELL_URL;
    if (saved !== undefined) process.env.FARM_NAPCAT_SHELL_URL = saved;
  }
});

test('shellDownloadUrls 支持一次给多个自定义源并自动去重', () => {
  const saved = {
    one: process.env.FARM_NAPCAT_SHELL_URL,
    many: process.env.FARM_NAPCAT_SHELL_URLS,
  };
  process.env.FARM_NAPCAT_SHELL_URLS =
    'https://a.example/napcat.zip, https://b.example/napcat.zip；https://a.example/napcat.zip';
  try {
    const urls = launcher.shellDownloadUrls();
    assert.strictEqual(urls[0], 'https://a.example/napcat.zip');
    assert.strictEqual(urls[1], 'https://b.example/napcat.zip');
    assert.strictEqual(urls.filter((u) => u === 'https://a.example/napcat.zip').length, 1);
  } finally {
    if (saved.one === undefined) delete process.env.FARM_NAPCAT_SHELL_URL;
    else process.env.FARM_NAPCAT_SHELL_URL = saved.one;
    if (saved.many === undefined) delete process.env.FARM_NAPCAT_SHELL_URLS;
    else process.env.FARM_NAPCAT_SHELL_URLS = saved.many;
  }
});

test('isZipArchive 拒绝 HTML 拦截页与过小文件', () => {
  const dir = tempDir('win-zip-');
  const html = path.join(dir, 'blocked.zip');
  fs.writeFileSync(html, Buffer.from('<html>403 Forbidden</html>', 'latin1'));
  assert.strictEqual(launcher.isZipArchive(html, 0), false);

  const tiny = path.join(dir, 'tiny.zip');
  fs.writeFileSync(tiny, Buffer.from('PK\x03\x04', 'latin1'));
  assert.strictEqual(launcher.isZipArchive(tiny), false);
  assert.strictEqual(launcher.isZipArchive(tiny, 1), true);

  assert.strictEqual(launcher.isZipArchive(path.join(dir, 'missing.zip'), 0), false);
});

test('findShellRoot 需要 node.exe 与 index.js 同在上级目录', () => {
  const dir = tempDir('win-root-');
  const nested = path.join(dir, 'napcat');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'napcat.mjs'), '// x\n', 'utf8');
  assert.strictEqual(launcher.findShellRoot(dir), '');

  fs.writeFileSync(path.join(dir, 'node.exe'), '');
  assert.strictEqual(launcher.findShellRoot(dir), '');

  fs.writeFileSync(path.join(dir, 'index.js'), '// boot\n', 'utf8');
  assert.strictEqual(launcher.findShellRoot(dir), dir);
});

test('writeWebuiConfig 写入端口与 token 并保留已有字段', () => {
  const dir = tempDir('win-webui-');
  const configDir = path.join(dir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'webui.json'),
    JSON.stringify({ host: '127.0.0.1', loginRate: 5 }),
    'utf8',
  );

  const file = launcher.writeWebuiConfig(dir, 'abc123', 6200);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(parsed.token, 'abc123');
  assert.strictEqual(parsed.port, 6200);
  assert.strictEqual(parsed.host, '127.0.0.1');
  assert.strictEqual(parsed.loginRate, 5);
});

test('panelEnv 把 .env 的值并入面板子进程环境', () => {
  const dir = tempDir('win-panelenv-');
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(
    envPath,
    'NAPCAT_LOGIN_ENABLED=true\nNAPCAT_OPENAUTH_URL="http://127.0.0.1:6099/plugin/x"\n',
    'utf8',
  );

  const env = launcher.panelEnv(envPath);
  assert.strictEqual(env.NAPCAT_LOGIN_ENABLED, 'true');
  assert.strictEqual(env.NAPCAT_OPENAUTH_URL, 'http://127.0.0.1:6099/plugin/x');

  process.env.QQFARM_PANEL_ENV_TEST = 'carried';
  try {
    assert.strictEqual(launcher.panelEnv(envPath).QQFARM_PANEL_ENV_TEST, 'carried');
  }
  finally {
    delete process.env.QQFARM_PANEL_ENV_TEST;
  }
});

test('randomAdminPassword 生成 16 位且满足口令强度', () => {
  for (let i = 0; i < 20; i += 1) {
    const pwd = launcher.randomAdminPassword();
    assert.strictEqual(pwd.length, 16);
    assert.match(pwd, /[a-z]/);
    assert.match(pwd, /[A-Z]/);
    assert.match(pwd, /[0-9]/);
    assert.match(pwd, /[^A-Za-z0-9]/);
    assert.doesNotMatch(pwd, /[0O1lI]/);
  }
});

test('passwordProblem 与后端口令策略一致', () => {
  assert.strictEqual(launcher.passwordProblem('Abcdef12'), '');
  assert.strictEqual(launcher.passwordProblem('Abcdef1!'), '');
  assert.match(launcher.passwordProblem('abc'), /至少 6 位/);
  assert.match(launcher.passwordProblem('abcdef'), /至少两种/);
});

test('ensureOnebotHttp 打开 OneBot HTTP 并保持幂等', () => {
  const dir = tempDir('qqfarm-onebot-');
  const configDir = path.join(dir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  const configFile = path.join(configDir, 'onebot11_123456.json');
  fs.writeFileSync(configFile, JSON.stringify({ network: { httpServers: [] } }, null, 2));
  const tokenFile = path.join(dir, 'token');
  fs.writeFileSync(tokenFile, 'abc123\n');

  const first = launcher.ensureOnebotHttp(dir, tokenFile);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.changed, true);
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.strictEqual(config.network.httpServers.length, 1);
  assert.strictEqual(config.network.httpServers[0].port, 3000);
  assert.strictEqual(config.network.httpServers[0].token, 'abc123');

  const second = launcher.ensureOnebotHttp(dir, tokenFile);
  assert.strictEqual(second.changed, false);
  assert.strictEqual(JSON.parse(fs.readFileSync(configFile, 'utf8')).network.httpServers.length, 1);
});
