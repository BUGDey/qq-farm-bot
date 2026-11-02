#!/usr/bin/env node
/**
 * Windows 一键启动器（不依赖 Docker）
 *
 * 菜单：
 *   1) 启动面板（本机 Node 模式，只有 web 面板）
 *   2) 启动 QQ 扫码版（本机 NapCat Shell + 面板）
 *   3) 状态
 *   4) 停止
 *   0) 退出
 *
 * 命令行：--napcat / --node / --stop / --status / --help
 *
 * QQ 扫码版原理：
 *   - 电脑上需装好 QQ NT（9.9.x）与 Node.js 20+
 *   - 把 NapCat 官方 NapCat.Shell.Windows.Node.zip 解压到 data\napcat\
 *     （保证 data\napcat\napcat\napcat.mjs 存在；也可把 zip 放进 data\napcat\ 让本脚本解压）
 *   - 本启动器负责：装 qq-miniapp-openauth 插件、写白名单与插件配置、
 *     生成并下发 WebUI Token、先起 NapCat 再起面板
 */

'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { setEnvValues, getEnvValue, readEnvText } = require('./env-file');

const ROOT = path.resolve(__dirname, '..', '..');
const NAPCAT_HOME = path.join(ROOT, 'data', 'napcat');
const NAPCAT_ZIP = path.join(NAPCAT_HOME, 'NapCat.Shell.Windows.Node.zip');
const TOKEN_DIR = path.join(NAPCAT_HOME, 'auth');
const TOKEN_FILE = path.join(TOKEN_DIR, 'token');
const PID_FILE = path.join(NAPCAT_HOME, 'win-launcher.pids.json');
const PLUGIN_SRC = path.join(ROOT, 'napcat', 'plugins', 'qq-miniapp-openauth');
const PLUGIN_NAME = 'qq-miniapp-openauth';

const PANEL_PORT = Number(process.env.ADMIN_PORT || 3007);
const NAPCAT_PORT = Number(process.env.NAPCAT_WEBUI_PORT || 6099);
const NAPCAT_VERSION = process.env.NAPCAT_SHELL_VERSION || 'v4.18.42';
const NAPCAT_DOWNLOAD_URL = `https://github.com/NapNeko/NapCatQQ/releases/download/${NAPCAT_VERSION}/NapCat.Shell.Windows.Node.zip`;

/* ----------------------------- 小工具 ----------------------------- */

function log(msg) {
  console.log(msg);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/** 找到包含 napcat.mjs 的 Shell 目录（兼容多解压一层的情况） */
function findShellDir(home = NAPCAT_HOME) {
  const candidates = [
    path.join(home, 'napcat'),
    home,
    path.join(home, 'NapCat.Shell'),
    path.join(home, 'NapCat.Shell.Windows.Node'),
  ];
  for (const dir of candidates) {
    if (fileExists(path.join(dir, 'napcat.mjs'))) return dir;
  }
  let entries = [];
  try {
    entries = fs.readdirSync(home);
  } catch {
    return null;
  }
  for (const name of entries) {
    const dir = path.join(home, name);
    if (dirExists(dir) && fileExists(path.join(dir, 'napcat.mjs'))) return dir;
  }
  return null;
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** 读取或生成 WebUI / 插件共用的 token */
function ensureToken(tokenFile = TOKEN_FILE) {
  const existing = readText(tokenFile).trim();
  if (/^[0-9a-f]{32,}$/i.test(existing)) return existing;
  ensureDir(path.dirname(tokenFile));
  const token = createToken();
  fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  return token;
}

/**
 * 把 qq-miniapp-openauth 写进 NapCat 插件白名单。
 * NapCat 4.x 在 napcat.mjs 内维护插件名数组，未列入的插件不会被加载。
 */
function patchPluginWhitelist(napcatMjsPath, pluginName = PLUGIN_NAME) {
  const source = readText(napcatMjsPath);
  if (!source) return { ok: false, reason: 'napcat.mjs 不存在或不可读' };
  if (source.includes(`"${pluginName}"`)) return { ok: true, changed: false };
  const marker = '"napcat-plugin-qce"';
  const at = source.indexOf(marker);
  if (at < 0) return { ok: false, reason: 'napcat.mjs 里没有插件白名单标记（napcat-plugin-qce）' };
  const patched = `${source.slice(0, at + marker.length)},\n  "${pluginName}"${source.slice(at + marker.length)}`;
  fs.writeFileSync(napcatMjsPath, patched, 'utf8');
  return { ok: true, changed: true };
}

/** 复制插件 + 写插件配置 + 打开插件开关 */
function installOpenauthPlugin(shellDir, token, pluginSrc = PLUGIN_SRC) {
  if (!fileExists(path.join(pluginSrc, 'package.json'))) {
    return { ok: false, reason: `插件源不存在：${pluginSrc}` };
  }
  const target = path.join(shellDir, 'plugins', PLUGIN_NAME);
  ensureDir(path.dirname(target));
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(pluginSrc, target, { recursive: true });

  const pluginConfig = path.join(shellDir, 'config', 'plugins', PLUGIN_NAME, 'config.json');
  ensureDir(path.dirname(pluginConfig));
  fs.writeFileSync(pluginConfig, `${JSON.stringify({ token }, null, 2)}\n`, { mode: 0o600 });

  const pluginsJson = path.join(shellDir, 'config', 'plugins.json');
  let current = {};
  try {
    const parsed = JSON.parse(readText(pluginsJson) || '{}');
    current = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    current = {};
  }
  current[PLUGIN_NAME] = true;
  ensureDir(path.dirname(pluginsJson));
  fs.writeFileSync(pluginsJson, `${JSON.stringify(current, null, 2)}\n`, 'utf8');

  const whitelist = patchPluginWhitelist(path.join(shellDir, 'napcat.mjs'));
  return { ok: whitelist.ok, whitelist, target, pluginConfig, pluginsJson };
}

/* --------------------------- .env 处理 --------------------------- */

function napcatEnvPairs(tokenFile = TOKEN_FILE) {
  return {
    NAPCAT_LOGIN_ENABLED: 'true',
    NAPCAT_WEBUI_URL: `http://127.0.0.1:${NAPCAT_PORT}/api`,
    NAPCAT_OPENAUTH_URL: `http://127.0.0.1:${NAPCAT_PORT}/plugin/${PLUGIN_NAME}/api`,
    NAPCAT_TOKEN_FILE: tokenFile,
    COMPOSE_PROFILES: '',
  };
}

function napcatDisablePairs() {
  return { NAPCAT_LOGIN_ENABLED: 'false' };
}

function ensureEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (fileExists(envPath)) return envPath;
  const init = path.join(__dirname, 'init-env.js');
  if (fileExists(init)) {
    const res = spawnSync(process.execPath, [init], { cwd: ROOT, stdio: 'inherit' });
    if (res.status !== 0) log('[警告] 生成 .env 失败，请手动创建 .env');
  }
  return envPath;
}

function adminPasswordHint() {
  const text = readEnvText(path.join(ROOT, '.env'));
  return getEnvValue(text, 'FARM_ADMIN_PASSWORD') || '（见 .env 的 FARM_ADMIN_PASSWORD）';
}

/* ---------------------------- 进程控制 ---------------------------- */

function pnpmCommand() {
  const probe = spawnSync('where', ['pnpm'], { encoding: 'utf8', shell: true });
  if (probe.status === 0 && String(probe.stdout || '').trim()) return { cmd: 'pnpm', args: [] };
  return { cmd: 'corepack', args: ['pnpm'] };
}

function waitPort(port, timeoutMs = 120000, intervalMs = 1000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.setTimeout(1500);
      const next = () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) resolve(false);
        else setTimeout(attempt, intervalMs);
      };
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', next);
      socket.once('error', next);
    };
    attempt();
  });
}

function savePids(pids) {
  ensureDir(NAPCAT_HOME);
  fs.writeFileSync(PID_FILE, `${JSON.stringify(pids, null, 2)}\n`, 'utf8');
}

function readPids() {
  try {
    const data = JSON.parse(readText(PID_FILE) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function killPid(pid) {
  if (!pid) return;
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
}

function stopAll() {
  const pids = readPids();
  let killed = 0;
  for (const value of Object.values(pids)) {
    if (value) {
      killPid(value);
      killed += 1;
    }
  }
  spawnSync('taskkill', ['/IM', 'NapCatWinBootMain.exe', '/T', '/F'], { stdio: 'ignore' });
  fs.rmSync(PID_FILE, { force: true });
  if (killed) log(`[停止] 已结束 ${killed} 个由启动器拉起的进程`);
  else log('[停止] 没有记录到由启动器拉起的进程（如仍占用端口，请手动结束 QQ / node）');
}

/* ---------------------------- 启动流程 ---------------------------- */

function napcatBootEntry(shellDir) {
  const candidates = [
    path.join(shellDir, 'NapCatWinBootMain.exe'),
    path.join(path.dirname(shellDir), 'bootmain', 'NapCatWinBootMain.exe'),
    path.join(shellDir, 'bootmain', 'NapCatWinBootMain.exe'),
  ];
  return candidates.find((p) => fileExists(p)) || '';
}

function buildFrontendIfNeeded() {
  if (fileExists(path.join(ROOT, 'web', 'dist', 'index.html'))) return true;
  log('[构建] 未找到 web/dist，正在构建前端（首次较慢）…');
  const pnpm = pnpmCommand();
  const build = spawnSync(pnpm.cmd, [...pnpm.args, '-C', 'web', 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) {
    log('[警告] 前端构建失败，面板可能打不开');
    return false;
  }
  return true;
}

function printNapcatMissingHint() {
  log('');
  log('[需要 NapCat Shell] 没找到 NapCat（data\\napcat\\napcat\\napcat.mjs）');
  log('  1. 打开 https://github.com/NapNeko/NapCatQQ/releases');
  log(`  2. 下载 NapCat.Shell.Windows.Node.zip（当前固化为 ${NAPCAT_VERSION}）`);
  log('  3. 解压后确保存在：data\\napcat\\napcat\\napcat.mjs');
  log(`     或把 zip 放到 ${NAPCAT_ZIP}，再运行本启动器会自动解压`);
  log('  4. 本机还需要：QQ NT（9.9.x）、Node.js 20+');
  log('');
  log(`  直链：${NAPCAT_DOWNLOAD_URL}`);
}

async function startNapcatMode() {
  const envPath = ensureEnvFile();
  ensureDir(TOKEN_DIR);
  const token = ensureToken();

  let shellDir = findShellDir();
  if (!shellDir && fileExists(NAPCAT_ZIP)) {
    log('[解压] 发现本地 NapCat.Shell.Windows.Node.zip，正在解压…');
    const out = spawnSync('tar', ['-xf', NAPCAT_ZIP, '-C', NAPCAT_HOME], { stdio: 'inherit' });
    if (out.status !== 0) log('[错误] 解压失败，请用资源管理器手动解压到 data\\napcat\\');
    shellDir = findShellDir();
  }
  if (!shellDir) {
    printNapcatMissingHint();
    return false;
  }

  log(`[NapCat] 目录：${shellDir}`);
  const installed = installOpenauthPlugin(shellDir, token);
  if (!installed.ok) {
    log(`[警告] 插件安装不完整：${installed.reason || installed.whitelist?.reason || '未知原因'}`);
    log('        面板的「QQ 扫码」账号依赖该插件，缺失时会登录失败');
  } else {
    log('[NapCat] qq-miniapp-openauth 插件已就绪');
  }

  setEnvValues(envPath, napcatEnvPairs());
  log('[配置] 已写入 .env：NAPCAT_LOGIN_ENABLED=true，Token 已生成');

  buildFrontendIfNeeded();

  const boot = napcatBootEntry(shellDir);
  const env = { ...process.env, WEBUI_TOKEN: token, NAPCAT_PORT: String(NAPCAT_PORT) };
  let napcatProc;
  if (boot) {
    log(`[NapCat] 启动 QQ（${path.basename(boot)}）… 首次需要在 NapCat WebUI 扫码`);
    napcatProc = spawn(boot, [], { cwd: path.dirname(boot), stdio: 'inherit', env });
  } else {
    log('[NapCat] 未找到 NapCatWinBootMain.exe，改用 node napcat.mjs 启动');
    napcatProc = spawn(process.execPath, ['napcat.mjs'], { cwd: shellDir, stdio: 'inherit', env });
  }
  napcatProc.on('exit', (code) => log(`[NapCat] 进程退出，code=${code}`));

  if (!(await waitPort(NAPCAT_PORT, 180000))) {
    log(`[警告] 等待 ${NAPCAT_PORT} 端口超时：请确认 QQ 已安装并完成扫码登录`);
  } else {
    log(`[NapCat] WebUI 就绪：http://127.0.0.1:${NAPCAT_PORT}/webui`);
  }

  const pnpm = pnpmCommand();
  log('[面板] 启动中…');
  const panel = spawn(pnpm.cmd, [...pnpm.args, '-C', 'core', 'dev'], { cwd: ROOT, stdio: 'inherit' });
  savePids({ napcat: napcatProc.pid, panel: panel.pid });

  const panelReady = await waitPort(PANEL_PORT, 240000);
  log('');
  log('==============================================');
  log(` 面板:      http://localhost:${PANEL_PORT}`);
  log(` NapCat:    http://127.0.0.1:${NAPCAT_PORT}/webui`);
  log(` 管理员:    admin / ${adminPasswordHint()}`);
  log(` Token:     ${TOKEN_FILE}`);
  log(' 扫码:      在 NapCat WebUI 点「二维码登录」手机 QQ 扫码；');
  log('            登录后到面板「账号管理 → 添加账号」选「QQ 扫码」');
  log(` 面板状态:  ${panelReady ? '已就绪' : '启动中，稍后刷新页面'}`);
  log(' 停止:      关闭本窗口，或双击 stop.bat');
  log('==============================================');
  log('');

  return await new Promise((resolve) => {
    panel.on('exit', (code) => {
      log(`[面板] 进程退出，code=${code}`);
      resolve(code === 0);
    });
  });
}

async function startNodeMode() {
  const envPath = ensureEnvFile();
  setEnvValues(envPath, napcatDisablePairs());
  buildFrontendIfNeeded();
  log('');
  log('==============================================');
  log(` 面板:   http://localhost:${PANEL_PORT}`);
  log(` 管理员: admin / ${adminPasswordHint()}`);
  log(' 关闭本窗口即停止服务');
  log('==============================================');
  log('');
  const pnpm = pnpmCommand();
  const child = spawn(pnpm.cmd, [...pnpm.args, '-C', 'core', 'dev'], { cwd: ROOT, stdio: 'inherit' });
  return await new Promise((resolve) => child.on('exit', (code) => resolve(code === 0)));
}

async function showStatus() {
  const shellDir = findShellDir();
  const panelUp = await waitPort(PANEL_PORT, 1500, 400);
  const napcatUp = await waitPort(NAPCAT_PORT, 1500, 400);
  log('');
  log('---------------- 当前状态 ----------------');
  log(` 面板 ${PANEL_PORT}:       ${panelUp ? '运行中' : '未启动'}`);
  log(` NapCat ${NAPCAT_PORT}:    ${napcatUp ? '运行中' : '未启动'}`);
  log(` NapCat Shell:      ${shellDir || '未安装（data\\napcat\\napcat\\napcat.mjs 不存在）'}`);
  log(` Token 文件:        ${fileExists(TOKEN_FILE) ? TOKEN_FILE : '尚未生成'}`);
  log('------------------------------------------');
  log('');
}

/* ----------------------------- 菜单 ------------------------------ */

function printMenu() {
  log('');
  log('  QQ 农场智能助手 · Windows 启动器');
  log('  ------------------------------------------');
  log('   1) 启动面板（本机 Node 模式，不需要 QQ）');
  log('   2) 启动 QQ 扫码版（本机 NapCat Shell）');
  log('   3) 查看状态');
  log('   4) 停止');
  log('   0) 退出');
  log('  ------------------------------------------');
  log('');
}

function ask(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.once('data', (buf) => {
      process.stdin.pause();
      resolve(String(buf).trim());
    });
  });
}

async function main(argv) {
  const args = new Set(argv);
  if (args.has('--help') || args.has('-h')) {
    log('用法: node core/scripts/win-launcher.js [--napcat|--node|--stop|--status|--help]');
    return;
  }
  if (args.has('--stop')) {
    stopAll();
    return;
  }
  if (args.has('--status')) {
    await showStatus();
    return;
  }
  if (args.has('--napcat')) {
    await startNapcatMode();
    return;
  }
  if (args.has('--node')) {
    await startNodeMode();
    return;
  }

  if (!process.stdin.isTTY) {
    await startNodeMode();
    return;
  }

  for (;;) {
    printMenu();
    const answer = await ask(' 请选择: ');
    if (answer === '1') {
      await startNodeMode();
      return;
    }
    if (answer === '2') {
      await startNapcatMode();
      return;
    }
    if (answer === '3') {
      await showStatus();
      continue;
    }
    if (answer === '4') {
      stopAll();
      continue;
    }
    if (answer === '0' || answer === '') return;
    log(' 输入无效，请重新选择');
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    log(`[错误] ${err && err.message ? err.message : err}`);
    process.exitCode = 1;
  });
}

module.exports = {
  ROOT,
  NAPCAT_HOME,
  TOKEN_FILE,
  PLUGIN_NAME,
  findShellDir,
  createToken,
  ensureToken,
  patchPluginWhitelist,
  installOpenauthPlugin,
  napcatEnvPairs,
  napcatDisablePairs,
  napcatBootEntry,
};
