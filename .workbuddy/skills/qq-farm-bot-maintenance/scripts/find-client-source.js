#!/usr/bin/env node
/**
 * 跨平台定位 QQ 农场官方小游戏源码与资源缓存目录（只读，不写入任何 QQ 目录）
 *
 * 用法（PowerShell / bash 均可，仓库任意目录执行）：
 *   node .workbuddy/skills/qq-farm-bot-maintenance/scripts/find-client-source.js
 *   node <脚本路径> --all                 # 列出全部候选源码目录
 *   node <脚本路径> --source <目录>        # 校验指定的解包目录是否完整
 *   node <脚本路径> --caches              # 同时列出 gamecaches 资源缓存根（按 QQ 号）
 *   node <脚本路径> --json                # 机器可读输出（默认也是 JSON）
 *
 * 输出：selected = 按 tsdk/tsdk.wasm 修改时间选出的最新且完整的源码目录。
 * exit 2 表示没找到完整候选。
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APP_ID = '1112386029';
const APP_PREFIX = `${APP_ID}_3_`;
const REQUIRED = ['game.js', 'game.json', path.join('tsdk', 'tsdk.wasm'), 'assets'];

/** 平台相关的默认根：Windows 与 macOS 的容器路径差别很大 */
function platformRoots() {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  switch (process.platform) {
    case 'win32':
      return {
        platform: 'win32',
        sourceRoot: path.join(appData, 'QQEX', 'miniapp', 'temps', 'miniapp_src'),
        cacheRoot: path.join(appData, 'QQEX', 'miniapp', 'fs'),
        hints: [
          '%APPDATA%\\QQEX\\miniapp\\temps\\miniapp_src',
          '%APPDATA%\\QQEX\\miniapp\\fs\\<QQ号>\\1112386029\\usr\\gamecaches',
        ],
      };
    case 'darwin':
      return {
        platform: 'darwin',
        sourceRoot: path.join(
          home, 'Library', 'Containers', 'com.tencent.qqexminiprogram', 'Data',
          'Library', 'Application Support', 'QQEX', 'miniapp', 'temps', 'miniapp_src',
        ),
        cacheRoot: path.join(
          home, 'Library', 'Containers', 'com.tencent.qqexminiprogram', 'Data',
          'Library', 'Application Support', 'QQEX', 'miniapp', 'fs',
        ),
        hints: [
          '~/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/temps/miniapp_src',
          '~/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/fs/*/1112386029/usr/gamecaches',
        ],
      };
    default:
      return { platform: process.platform, sourceRoot: '', cacheRoot: '', hints: [] };
  }
}

function parseArgs(argv) {
  const options = { source: null, all: false, caches: true, root: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') options.all = true;
    else if (arg === '--no-caches') options.caches = false;
    else if (arg === '--caches') options.caches = true;
    else if (arg === '--source' || arg === '--root') {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} 需要一个路径`);
      options.source = path.resolve(value);
      i += 1;
    }
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: find-client-source.js [--source <dir>] [--all] [--caches|--no-caches] [--json]');
      process.exit(0);
    }
    else throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function inspectCandidate(directory) {
  const absolute = path.resolve(directory);
  const missing = REQUIRED.filter(rel => !fs.existsSync(path.join(absolute, rel)));
  if (missing.length) return { directory: absolute, complete: false, missing };
  const wasm = path.join(absolute, 'tsdk', 'tsdk.wasm');
  const stat = fs.statSync(wasm);
  return {
    directory: fs.realpathSync(absolute),
    complete: true,
    wasm: {
      path: fs.realpathSync(wasm),
      mtime: stat.mtime.toISOString(),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    },
  };
}

/** 在源码根下找 1112386029_3_* 目录；root 不存在时回退到"任意含 tsdk.wasm 的目录" */
function discoverSources(root) {
  if (!root || !fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith(APP_PREFIX))
    .map(e => inspectCandidate(path.join(root, e.name)));
  return entries;
}

/** 资源缓存：fs/<QQ号>/1112386029/usr/gamecaches */
function discoverCaches(cacheRoot) {
  if (!cacheRoot || !fs.existsSync(cacheRoot)) return [];
  return fs.readdirSync(cacheRoot, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const dir = path.join(cacheRoot, e.name, APP_ID, 'usr', 'gamecaches');
      if (!fs.existsSync(dir)) return null;
      const cacheList = path.join(dir, 'cacheList.json');
      return {
        qqAccount: e.name,
        path: dir,
        cacheList: fs.existsSync(cacheList) ? cacheList : null,
        bundles: fs.existsSync(dir)
          ? fs.readdirSync(dir, { withFileTypes: true })
              .filter(x => x.isDirectory())
              .map(x => x.name)
          : [],
      };
    })
    .filter(Boolean);
}

try {
  const options = parseArgs(process.argv.slice(2));
  const roots = platformRoots();
  const candidates = options.source
    ? [inspectCandidate(options.source)]
    : discoverSources(roots.sourceRoot);

  const complete = candidates
    .filter(c => c.complete)
    .sort((a, b) => b.wasm.mtimeMs - a.wasm.mtimeMs);

  const result = {
    platform: roots.platform,
    sourceRoot: roots.sourceRoot,
    cacheRoot: roots.cacheRoot,
    hints: roots.hints,
    selected: complete[0] || null,
    candidates: options.all ? candidates : undefined,
    caches: options.caches ? discoverCaches(roots.cacheRoot) : undefined,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!complete.length) process.exit(2);
}
catch (error) {
  console.error(String(error && error.message));
  process.exit(1);
}
