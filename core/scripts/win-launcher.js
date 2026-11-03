#!/usr/bin/env node
/**
 * Windows 一键启动器（不依赖 Docker）
 *
 * 菜单：
 *   1) 启动面板（本机 Node 模式，只有 web 面板）
 *   2) 启动 QQ 扫码版（本机 NapCat Shell + 面板）
 *   3) 状态
 *   4) 停止
 *   5) 重置管理员密码（忘记密码时用，随机生成并写入 .env）
 *   0) 退出
 *
 * 命令行：--napcat / --node / --stop / --status / --reset-admin / --help
 *   --reset-admin [新密码] [用户名]  不传密码则随机生成 16 位
 *
 * QQ 扫码版原理：
 *   - 电脑上只需装好 QQ NT（9.9.x）与 Node.js 20+，其余全部自动完成
 *   - 自动下载 NapCat 官方 NapCat.Shell.Windows.Node.zip 并解压到 data\napcat\
 *     （也可手动把 zip 放进 data\napcat\，或用 FARM_NAPCAT_SHELL_URL 指定镜像）
 *   - 本启动器负责：下载与解压 NapCat Shell、装 qq-miniapp-openauth 插件、
 *     写白名单与插件配置、生成并下发 WebUI Token、先起 NapCat 再起面板
 */

'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { setEnvValues, getEnvValue, readEnvText, readEnvPairs } = require('./env-file');

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
/** GitHub 直链在部分地区不稳，按顺序回退到镜像（可用 FARM_NAPCAT_SHELL_URL 覆盖） */
const NAPCAT_MIRRORS = ['https://ghproxy.net/', 'https://mirror.ghproxy.com/'];
const MIN_ZIP_BYTES = 5 * 1024 * 1024;

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

function napcatEnvPairs(tokenFile = TOKEN_FILE, pluginConfigFile = '') {
  const pairs = {
    NAPCAT_LOGIN_ENABLED: 'true',
    NAPCAT_WEBUI_URL: `http://127.0.0.1:${NAPCAT_PORT}/api`,
    NAPCAT_OPENAUTH_URL: `http://127.0.0.1:${NAPCAT_PORT}/plugin/${PLUGIN_NAME}/api`,
    NAPCAT_TOKEN_FILE: tokenFile,
    COMPOSE_PROFILES: '',
  };
  // 插件 Token 以插件自己的 config.json 为准：用户可能用 NapCat 插件市场重装过它
  if (pluginConfigFile) pairs.NAPCAT_PLUGIN_TOKEN_FILE = pluginConfigFile;
  return pairs;
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

/**
 * 面板子进程的环境变量：进程环境 + .env 里写的值（.env 优先）。
 *
 * core 自己不读 .env，只有 start.sh 会把变量 export 出来；
 * 所以 Windows 下若只写文件不注入，`NAPCAT_LOGIN_ENABLED` 永远传不到面板，
 * 账号弹窗里的「QQ 扫码」页签就会一直缺失。
 */
function panelEnv(envPath) {
  return { ...process.env, ...readEnvPairs(envPath || path.join(ROOT, '.env')) };
}

/** 生成 16 位随机密码，去掉容易看错的 0/O/1/l/I，且保证四种字符各至少一个（满足后端口令策略） */
function randomAdminPassword() {
  const groups = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%^&*',
  ];
  const chars = [];
  for (const group of groups) {
    chars.push(group[crypto.randomInt(group.length)]);
  }
  const pool = groups.join('');
  while (chars.length < 16) {
    chars.push(pool[crypto.randomInt(pool.length)]);
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

/** 与后端口令策略保持一致的预检查，避免脚本跑一半才报错 */
function passwordProblem(password) {
  const value = String(password || '');
  if (value.length < 6) return '密码长度至少 6 位';
  const kinds = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  if (kinds < 2) return '密码需包含大写字母、小写字母、数字、特殊符号中的至少两种';
  return '';
}

/**
 * 重置管理员密码：写库 + 同步 .env
 * 与 Linux 的 ./start.sh reset-admin 等价，密码写进 FARM_ADMIN_PASSWORD，
 * 这样「密码看 .env」的说明在任何时候都成立。
 */
function resetAdmin(args = []) {
  const envPath = ensureEnvFile();
  const envText = readEnvText(envPath);
  const password = String(args[0] || '').trim() || randomAdminPassword();
  const username = String(args[1] || getEnvValue(envText, 'FARM_ADMIN_USERNAME') || 'admin').trim();
  const script = path.join(__dirname, 'reset-admin-password.js');
  if (!fileExists(script)) {
    log('[错误] 找不到 core/scripts/reset-admin-password.js');
    return false;
  }
  const problem = passwordProblem(password);
  if (problem) {
    log(`[错误] ${problem}`);
    log('       提示：不带密码参数运行会自动生成一个合规的随机密码');
    return false;
  }

  log('');
  log(`[重置] 正在重置管理员密码：${username}`);
  const res = spawnSync(process.execPath, [script, password, username], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) {
    log('[错误] 重置失败，请检查上面的输出（数据目录：core\\data）');
    return false;
  }

  setEnvValues(envPath, {
    FARM_ADMIN_USERNAME: username,
    FARM_ADMIN_PASSWORD: password,
    FARM_BOOTSTRAP_ADMIN_PASSWORD: password,
  });

  log('');
  log('==============================================');
  log(` 管理员账号: ${username}`);
  log(` 新密码:     ${password}`);
  log(` 已同步写入 .env（FARM_ADMIN_PASSWORD）`);
  log(' 如果面板/扫码版正在运行，请先关掉窗口再重新启动');
  log('==============================================');
  log('');
  return true;
}

/* ---------------------------- 进程控制 ---------------------------- */

function pnpmCommand() {
  const comspec = process.env.ComSpec || 'cmd.exe';
  const probe = spawnSync('where', ['pnpm'], { encoding: 'utf8' });
  let first = String(probe.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0];
  if (probe.status === 0 && first) {
    // `where pnpm` 常返回无扩展名的 shim，补上 .cmd 才能被 spawn
    if (!path.extname(first) && fileExists(`${first}.cmd`)) first = `${first}.cmd`;
    if (/\.(cmd|bat)$/i.test(first)) return { cmd: comspec, args: ['/c', first] };
    return { cmd: first, args: [] };
  }
  return { cmd: comspec, args: ['/c', 'corepack pnpm'] };
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

/** 端口当前是否有人监听（不做重试，只用于启动前自检） */
function portOpen(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(timeoutMs);
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/**
 * 面板端口已被占用说明旧面板还在跑：新起的实例抢不到端口，
 * 用户看到的还是旧进程（旧环境变量），会误以为「选了 2 却没生效」。
 */
async function warnIfPanelRunning() {
  if (!(await portOpen(PANEL_PORT))) return false;
  log(`[警告] 端口 ${PANEL_PORT} 已被占用：面板可能已经在运行。`);
  log('        新开的实例抢不到端口，你看到的仍是旧进程（旧的环境变量）。');
  log('        请先双击 stop.bat 关闭旧面板，再重新选一次。');
  return true;
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

/** NapCat Shell 自带 QQNT 运行时（node.exe + index.js + napcat/napcat.mjs），不需要本机 QQ */
function findShellRoot(home = NAPCAT_HOME) {
  const shellDir = findShellDir(home);
  if (!shellDir) return '';
  const parent = path.dirname(shellDir);
  const hasRuntime =
    fileExists(path.join(parent, 'node.exe')) && fileExists(path.join(parent, 'index.js'));
  return hasRuntime ? parent : '';
}

/** 写 NapCat 的 webui.json（端口 + token），面板靠这个 token 调 NapCat API */
function writeWebuiConfig(shellDir, token, port = NAPCAT_PORT) {
  const configDir = path.join(shellDir, 'config');
  ensureDir(configDir);
  const file = path.join(configDir, 'webui.json');
  let current = {};
  try {
    const parsed = JSON.parse(readText(file));
    if (parsed && typeof parsed === 'object') current = parsed;
  } catch {
    current = {};
  }
  const next = {
    ...current,
    host: current.host || '0.0.0.0',
    port: Number(current.port) || port,
    token,
    loginRate: Number(current.loginRate) || 3,
  };
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
  return file;
}

function readLogTail(file, lines = 12) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const all = text.split(/\r?\n/).filter((line) => line.trim());
    return all.slice(-lines);
  } catch {
    return [];
  }
}

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
  log('[需要 NapCat Shell] 自动下载失败，没能准备好 NapCat');
  log('  可能原因：网络被拦、GitHub 不可达、杀毒软件拦截解压');
  log('  手动兜底（任选其一）：');
  log(`    a. 把 NapCat.Shell.Windows.Node.zip 放到 ${NAPCAT_ZIP} 后重新选 2`);
  log('    b. 设置镜像后重试：set FARM_NAPCAT_SHELL_URL=<你那边能下的完整 zip 地址>');
  log('    c. 打开 https://github.com/NapNeko/NapCatQQ/releases 自行下载并解压到');
  log('       data\\napcat\\napcat\\ （保证存在 napcat.mjs）');
  log('  另外本机仍需要：Node.js 20+');
  log('  （NapCat 自带 QQNT 运行时，不需要另外安装 QQ）');
  log('');
  log(`  官方直链：${NAPCAT_DOWNLOAD_URL}`);
}

/** 候选下载地址：自定义 > 官方直链 > 镜像 */
function shellDownloadUrls() {
  const custom = String(process.env.FARM_NAPCAT_SHELL_URL || '').trim();
  const urls = [];
  if (custom) urls.push(custom);
  urls.push(NAPCAT_DOWNLOAD_URL);
  for (const mirror of NAPCAT_MIRRORS) urls.push(mirror + NAPCAT_DOWNLOAD_URL);
  return urls;
}

/** 判断是不是真的 zip（防止把 HTML 拦截页当压缩包） */
function isZipArchive(zipPath, minBytes = MIN_ZIP_BYTES) {
  let stat;
  try {
    stat = fs.statSync(zipPath);
  } catch {
    return false;
  }
  if (!stat.isFile() || stat.size < minBytes) return false;
  let head;
  try {
    const fd = fs.openSync(zipPath, 'r');
    head = Buffer.alloc(2);
    fs.readSync(fd, head, 0, 2, 0);
    fs.closeSync(fd);
  } catch {
    return false;
  }
  return head.toString('latin1') === 'PK';
}

function hasCommand(cmd) {
  const res = spawnSync('where', [cmd], { stdio: 'ignore' });
  return res.status === 0;
}

/** 下载文件：优先 curl.exe（Windows 10+ 自带），失败回退 PowerShell */
function downloadFile(url, dest) {
  ensureDir(path.dirname(dest));
  try {
    fs.rmSync(dest, { force: true });
  } catch {
    /* 忽略 */
  }
  if (hasCommand('curl')) {
    const res = spawnSync(
      'curl.exe',
      ['-L', '--fail', '--retry', '3', '--retry-delay', '2', '--connect-timeout', '20', '-o', dest, url],
      { stdio: 'inherit' },
    );
    if (res.status === 0 && fileExists(dest)) return true;
  }
  const script = [
    "$ProgressPreference='SilentlyContinue'",
    `Invoke-WebRequest -Uri '${url}' -OutFile '${dest}' -UseBasicParsing -TimeoutSec 900`,
  ].join('; ');
  const res = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    stdio: 'inherit',
  });
  return res.status === 0 && fileExists(dest);
}

/** 解压 zip：优先 tar（Windows 10 自带 bsdtar），失败回退 Expand-Archive */
function extractZip(zipPath, destDir) {
  ensureDir(destDir);
  const tar = spawnSync('tar', ['-xf', zipPath, '-C', destDir], { stdio: 'inherit' });
  if (tar.status === 0) return true;
  const script = `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`;
  const res = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    stdio: 'inherit',
  });
  return res.status === 0;
}

/** 下载并解压 NapCat Shell，成功返回目录，失败返回 null */
async function ensureNapcatShell() {
  ensureDir(NAPCAT_HOME);
  for (const url of shellDownloadUrls()) {
    log(`[下载] NapCat Shell: ${url}`);
    if (!downloadFile(url, NAPCAT_ZIP)) {
      log('[警告] 下载失败，换下一个源');
      continue;
    }
    if (!isZipArchive(NAPCAT_ZIP)) {
      log('[警告] 下载到的不是 zip（可能被网络拦截），换下一个源');
      try {
        fs.rmSync(NAPCAT_ZIP, { force: true });
      } catch {
        /* 忽略 */
      }
      continue;
    }
    const sizeMb = (fs.statSync(NAPCAT_ZIP).size / 1048576).toFixed(1);
    log(`[解压] 已下载 ${sizeMb} MB，正在解压到 data\\napcat\\ …`);
    if (!extractZip(NAPCAT_ZIP, NAPCAT_HOME)) {
      log('[错误] 解压失败：请手动解压，或检查是否有杀毒软件拦截');
      continue;
    }
    const dir = findShellDir();
    if (dir) {
      try {
        fs.rmSync(NAPCAT_ZIP, { force: true });
      } catch {
        /* 忽略 */
      }
      return dir;
    }
    log('[警告] 解压完成但没找到 napcat.mjs');
  }
  return null;
}

/** 找本机 QQ NT 安装位置（NapCat 依赖它启动 QQ） */
function findQqInstall() {
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  const relatives = [
    ['Tencent', 'QQNT', 'QQ.exe'],
    ['Tencent', 'QQNT', 'QQScLauncher.exe'],
    ['Tencent', 'QQ', 'Bin', 'QQ.exe'],
  ];
  for (const root of roots) {
    for (const rel of relatives) {
      const candidate = path.join(root, ...rel);
      if (fileExists(candidate)) return candidate;
    }
  }
  return '';
}

/** 只提示、不阻断：缺少依赖时 NapCat 起不来，但面板仍可用 */
function warnIfMissingPrereqs() {
  const major = Number(String(process.versions.node).split('.')[0]);
  if (major < 20) {
    log(`[警告] 当前 Node.js ${process.versions.node} 低于 20，NapCat 可能启动失败`);
    log('        下载：https://nodejs.org/zh-cn/download');
  }
  if (!findShellRoot()) {
    log('[提示] 未检测到 NapCat 自带运行时，将回退到本机 QQ 模式');
    if (!findQqInstall()) {
      log('[警告] 本机也没有安装 QQ NT（9.9.x），扫码会失败');
      log('        下载：https://im.qq.com/pcqq');
    }
  }
}

async function startNapcatMode() {
  const envPath = ensureEnvFile();
  if (await warnIfPanelRunning()) return false;
  ensureDir(TOKEN_DIR);
  const token = ensureToken();

  let shellDir = findShellDir();
  if (!shellDir && fileExists(NAPCAT_ZIP)) {
    if (isZipArchive(NAPCAT_ZIP)) {
      log('[解压] 发现本地 NapCat.Shell.Windows.Node.zip，正在解压…');
      if (!extractZip(NAPCAT_ZIP, NAPCAT_HOME)) log('[错误] 解压失败，将尝试重新下载');
      shellDir = findShellDir();
    } else {
      log('[警告] data\\napcat\\ 下的 zip 不完整，已忽略');
      try {
        fs.rmSync(NAPCAT_ZIP, { force: true });
      } catch {
        /* 忽略 */
      }
    }
  }
  if (!shellDir) {
    log('[准备] 未检测到 NapCat Shell，开始自动下载（约 120MB，首次较慢）…');
    shellDir = await ensureNapcatShell();
  }
  if (!shellDir) {
    printNapcatMissingHint();
    return false;
  }
  warnIfMissingPrereqs();

  log(`[NapCat] 目录：${shellDir}`);
  const installed = installOpenauthPlugin(shellDir, token);
  if (!installed.ok) {
    log(`[警告] 插件安装不完整：${installed.reason || installed.whitelist?.reason || '未知原因'}`);
    log('        面板的「QQ 扫码」账号依赖该插件，缺失时会登录失败');
  } else {
    log('[NapCat] qq-miniapp-openauth 插件已就绪');
  }

  setEnvValues(envPath, napcatEnvPairs(TOKEN_FILE, path.join(shellDir, 'config', 'plugins', PLUGIN_NAME, 'config.json')));
  log('[配置] 已写入 .env：NAPCAT_LOGIN_ENABLED=true，Token 已生成');

  buildFrontendIfNeeded();

  const runtimeRoot = findShellRoot();
  const webuiFile = writeWebuiConfig(shellDir, token);
  log(`[配置] WebUI：${webuiFile}（端口 ${NAPCAT_PORT}）`);

  const runtimeLog = path.join(NAPCAT_HOME, 'napcat-runtime.log');
  const runtimeErrLog = path.join(NAPCAT_HOME, 'napcat-runtime.err.log');
  let napcatProc;
  if (runtimeRoot) {
    log('[NapCat] 使用自带 QQNT 运行时（node.exe index.js），不需要本机 QQ');
    const out = fs.openSync(runtimeLog, 'w');
    const err = fs.openSync(runtimeErrLog, 'w');
    napcatProc = spawn('cmd.exe', ['/c', 'chcp 65001>nul && node.exe index.js'], {
      cwd: runtimeRoot,
      stdio: ['ignore', out, err],
      windowsHide: true,
    });
  } else {
    const boot = napcatBootEntry(shellDir);
    const qq = findQqInstall();
    const env = { ...process.env, WEBUI_TOKEN: token, NAPCAT_PORT: String(NAPCAT_PORT) };
    if (boot && qq) {
      log(`[NapCat] 回退到本机 QQ 模式：${qq}`);
      napcatProc = spawn(boot, [qq, path.join(path.dirname(boot), 'NapCatWinBootHook.dll')], {
        cwd: path.dirname(boot),
        stdio: 'inherit',
        env,
      });
    } else {
      log('[NapCat] 未找到自带运行时，改用本机 Node 直接跑 napcat.mjs');
      napcatProc = spawn(process.execPath, ['napcat.mjs'], { cwd: shellDir, stdio: 'inherit', env });
    }
  }
  napcatProc.on('exit', (code) => {
    log(`[NapCat] 进程退出，code=${code}`);
    const tail = readLogTail(runtimeLog, 8);
    if (tail.length) {
      log('[NapCat] 最近日志：');
      for (const line of tail) log(`  ${line}`);
    }
    if (code !== 0) log(`[NapCat] 完整日志：${runtimeLog}`);
  });

  if (!(await waitPort(NAPCAT_PORT, 180000))) {
    log(`[警告] 等待 ${NAPCAT_PORT} 端口超时：请确认 QQ 已安装并完成扫码登录`);
  } else {
    log(`[NapCat] WebUI 就绪：http://127.0.0.1:${NAPCAT_PORT}/webui`);
  }

  const pnpm = pnpmCommand();
  log('[面板] 启动中…');
  const panel = spawn(pnpm.cmd, [...pnpm.args, '-C', 'core', 'dev'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: panelEnv(envPath),
  });
  savePids({ napcat: napcatProc.pid, panel: panel.pid });

  const panelReady = await waitPort(PANEL_PORT, 240000);
  log('');
  log('==============================================');
  log(` 面板:      http://localhost:${PANEL_PORT}`);
  log(` NapCat:    http://127.0.0.1:${NAPCAT_PORT}/webui`);
  log(` NapCat Token（WebUI 登录用）: ${token}`);
  log(` 管理员:    admin / ${adminPasswordHint()}`);
  log(' 扫码:      1) 打开上面的 NapCat WebUI，粘贴上面那串 Token 登录');
  log('            2) 页面里会显示二维码，用手机 QQ 扫码完成授权');
  log(`            二维码图片：${path.join(shellDir, 'cache', 'qrcode.png')}`);
  log('            3) 扫码成功后，到面板「账号管理 → 添加账号」选「QQ 扫码」');
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
  if (await warnIfPanelRunning()) return false;
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
  const child = spawn(pnpm.cmd, [...pnpm.args, '-C', 'core', 'dev'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: panelEnv(envPath),
  });
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
  log('   5) 重置管理员密码（忘记密码时用）');
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
  const wantsReset = args.has('--reset-admin') || args.has('reset-admin');
  if (args.has('--help') || args.has('-h')) {
    log('用法: node core/scripts/win-launcher.js [--napcat|--node|--stop|--status|--reset-admin|--help]');
    log('  --reset-admin [新密码] [用户名]   重置管理员密码（不传密码则随机生成）');
    log('  也可以写: start.bat reset-admin');
    return;
  }
  if (wantsReset) {
    const marker = args.has('--reset-admin') ? '--reset-admin' : 'reset-admin';
    const rest = argv.slice(argv.indexOf(marker) + 1).filter((item) => !item.startsWith('--'));
    resetAdmin(rest);
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
    if (answer === '5') {
      resetAdmin();
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
  findShellRoot,
  writeWebuiConfig,
  createToken,
  ensureToken,
  patchPluginWhitelist,
  installOpenauthPlugin,
  napcatEnvPairs,
  napcatDisablePairs,
  panelEnv,
  napcatBootEntry,
  shellDownloadUrls,
  isZipArchive,
  downloadFile,
  extractZip,
  ensureNapcatShell,
  findQqInstall,
  warnIfMissingPrereqs,
  randomAdminPassword,
  passwordProblem,
  resetAdmin,
  portOpen,
  warnIfPanelRunning,
};
