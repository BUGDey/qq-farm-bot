#!/usr/bin/env node
'use strict';

/**
 * Linux source-run NapCat restart watchdog.
 *
 * The Docker deployment is fully covered by napcat/docker-entrypoint.sh: it watches
 * the shared maintenance directory and restarts only the NapCat container.
 *
 * A Linux "source" deployment (./start.sh 1 on bare Node) does not launch NapCat by
 * itself — NapCat is normally run by the operator, outside this project. This script
 * is the opt-in hook for those installs: point it at the commands that start/stop
 * NapCat and it honours the same 30h request/ack protocol, restarting only NapCat.
 *
 * Safety rules:
 * - never touches PID 1, this process, its parent, or any PID in NAPCAT_WATCHDOG_PROTECT
 * - only signals a PID whose /proc/<pid>/cmdline looks like a NapCat process
 * - without an explicit start command nothing is killed (nothing could be restarted)
 * - a nonce is only acknowledged after the owner reports a successful start
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { fileTransport, watchNapcatRequests } = require('../src/services/napcat-maintenance');

const DEFAULT_STOP_TIMEOUT_MS = 20000;

function readCommand(value) {
  const text = String(value || '').trim();
  return text ? text : '';
}

function looksLikeNapcat(pid) {
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
    return /napcat/i.test(cmdline);
  } catch {
    return false;
  }
}

function protectedPids(extra = '') {
  const set = new Set([1, process.pid, process.ppid].filter(pid => Number.isInteger(pid) && pid > 0));
  for (const item of String(extra || '').split(/[,;\s]+/)) {
    const pid = Number(item);
    if (Number.isInteger(pid) && pid > 0) set.add(pid);
  }
  return set;
}

function findPidFile({ explicit, maintenanceDir }) {
  const candidates = [explicit, maintenanceDir && path.join(maintenanceDir, 'napcat.pid'),
    'data/napcat/napcat.pid', '/tmp/napcat.pid'].filter(Boolean);
  for (const file of candidates) {
    try {
      const raw = fs.readFileSync(file, 'utf8').trim();
      const pid = Number(raw);
      if (Number.isInteger(pid) && pid > 0) return { pid, file };
    } catch { /* missing candidate is normal */ }
  }
  return null;
}

/** Stop only a validated NapCat-owned PID; never a whole process-name sweep. */
async function stopNapcat({ pidFile, protect = '', timeoutMs = DEFAULT_STOP_TIMEOUT_MS, kill = process.kill,
  wait = ms => new Promise(r => setTimeout(r, ms)), looksLike = looksLikeNapcat, isAlive = pid => process.kill(pid, 0) } = {}) {
  const found = findPidFile(pidFile);
  if (!found) throw new Error('未找到 NapCat PID 文件，无法安全停止（不会按进程名批量结束）');
  if (protectedPids(protect).has(found.pid)) throw new Error(`拒绝停止受保护进程 PID ${found.pid}`);
  if (!looksLike(found.pid)) throw new Error(`PID ${found.pid} 的 cmdline 不像 NapCat，拒绝停止`);
  kill(found.pid, 'SIGTERM');
  await wait(timeoutMs);
  try {
    isAlive(found.pid);
  } catch (error) {
    if (error.code === 'ESRCH') return;
    throw error;
  }
  if (!looksLike(found.pid)) throw new Error(`PID ${found.pid} 已不再匹配 NapCat，拒绝强制停止`);
  kill(found.pid, 'SIGKILL');
}

function startNapcat({ startCommand, cwd, shell = '/bin/bash' } = {}) {
  const command = readCommand(startCommand);
  if (!command) throw new Error('未配置 NAPCAT_LINUX_START_CMD，无法重启 NapCat');
  return new Promise((resolve, reject) => {
    const child = spawn(shell, ['-lc', command], { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`启动 NapCat 命令失败（${signal || `exit ${code}`}）`));
    });
  });
}

function createRestart({ maintenanceDir, startCommand, stopCommand, pidFile, cwd, shell } = {}) {
  return async function restart() {
    // Check the replacement command first: never stop NapCat if it cannot be started again.
    if (!readCommand(startCommand)) throw new Error('未配置 NAPCAT_LINUX_START_CMD，无法重启 NapCat');
    const stop = readCommand(stopCommand);
    if (stop) {
      const result = spawnSync(shell || '/bin/bash', ['-lc', stop], { cwd, stdio: 'ignore' });
      if (result.status !== 0) throw new Error(`停止 NapCat 命令失败（exit ${result.status}）`);
    } else {
      await stopNapcat({ pidFile: { explicit: pidFile, maintenanceDir } });
    }
    await startNapcat({ startCommand, cwd, shell });
  };
}

async function main() {
  const maintenanceDir = readCommand(process.env.NAPCAT_MAINTENANCE_DIR);
  if (!maintenanceDir) {
    console.error('[NapCat] 未设置 NAPCAT_MAINTENANCE_DIR，watchdog 退出');
    process.exit(1);
  }
  fs.mkdirSync(maintenanceDir, { recursive: true });
  const transport = fileTransport(maintenanceDir);
  const restart = createRestart({
    maintenanceDir,
    startCommand: process.env.NAPCAT_LINUX_START_CMD,
    stopCommand: process.env.NAPCAT_LINUX_STOP_CMD,
    pidFile: process.env.NAPCAT_LINUX_PID_FILE,
    cwd: process.env.NAPCAT_LINUX_CWD || undefined,
  });
  // A watchdog that cannot start NapCat must never kill the running one.
  if (!readCommand(process.env.NAPCAT_LINUX_START_CMD)) {
    console.error('[NapCat] 未配置 NAPCAT_LINUX_START_CMD，watchdog 只观察不会重启');
  }
  const watcher = watchNapcatRequests({
    transport,
    keepAlive: true,
    restart: async () => {
      if (!readCommand(process.env.NAPCAT_LINUX_START_CMD)) throw new Error('缺少 NAPCAT_LINUX_START_CMD，拒绝停止正在运行的 NapCat');
      await restart();
    },
    onError: error => console.warn('[NapCat] Linux 源码模式自动维护失败，将限频重试:', error.message),
  });
  watcher.start();
  console.log(`[NapCat] Linux 源码模式 watchdog 已启动，维护目录: ${maintenanceDir}`);
  const shutdown = () => { watcher.stop(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { findPidFile, looksLikeNapcat, protectedPids, stopNapcat, startNapcat, createRestart };

if (require.main === module) {
  main().catch((error) => {
    console.error('[NapCat] watchdog 启动失败:', error.message);
    process.exit(1);
  });
}
