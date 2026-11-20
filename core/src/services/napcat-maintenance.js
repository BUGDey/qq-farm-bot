'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const INTERVAL_MS = 30 * 60 * 60 * 1000;
const MAX_WAIT_MS = 10 * 60 * 1000;
const RETRY_MS = 60 * 1000;

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, value, { mode: 0o660 });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function fileTransport(directory) {
  const requestFile = path.join(directory, 'restart-request');
  const ackFile = path.join(directory, 'restart-ack.json');
  return {
    readRequest() {
      try { return fs.readFileSync(requestFile, 'utf8').trim(); } catch { return ''; }
    },
    readAck() {
      try {
        const ack = JSON.parse(fs.readFileSync(ackFile, 'utf8'));
        return Number.isFinite(ack.startedAt) && ack.startedAt > 0 ? ack : null;
      } catch { return null; }
    },
    request(nonce) { atomicWrite(requestFile, `${nonce}\n`); },
    acknowledge(nonce, startedAt = Date.now()) {
      atomicWrite(ackFile, JSON.stringify({ nonce, startedAt }));
    },
  };
}

/** The scheduler never controls Docker or unrelated services. The owner acknowledges a new process start. */
function createMaintenance({ login, transport, now = Date.now, setInterval: schedule = setInterval,
  clearInterval: unschedule = clearInterval, intervalMs = INTERVAL_MS, maxWaitMs = MAX_WAIT_MS,
  retryMs = RETRY_MS, pollMs = 1000, makeNonce = () => crypto.randomBytes(24).toString('hex'),
  onError = () => {} }) {
  let timer = null;
  let stopped = false;
  let busy = false;
  let drainingAt = null;
  let nextAttemptAt = 0;
  let pending = '';
  let nextAt = now() + intervalMs;
  let initialized = false;

  async function tick() {
    if (stopped || busy) return;
    busy = true;
    try {
      const ack = transport.readAck();
      if (!initialized) {
        initialized = true;
        if (ack) nextAt = ack.startedAt + intervalMs;
        const request = transport.readRequest();
        if (request && request !== ack?.nonce) {
          pending = request;
          drainingAt = now();
          login.beginMaintenance();
          login.invalidateForMaintenance();
        }
      }
      if (pending) {
        if (ack?.nonce === pending && now() >= nextAttemptAt) {
          if (await login.maintenanceReady()) {
            if (stopped) return;
            nextAt = ack.startedAt + intervalMs;
            pending = '';
            drainingAt = null;
            nextAttemptAt = 0;
            login.endMaintenance();
          } else nextAttemptAt = now() + retryMs;
        }
        // Keep the same nonce on failures/timeouts: a slow owner must never be restarted twice.
        return;
      }
      if (now() < nextAt || now() < nextAttemptAt) return;
      if (drainingAt === null) {
        drainingAt = now();
        login.beginMaintenance();
      }
      if (login.hasActiveTasks() && now() - drainingAt < maxWaitMs) return;
      login.invalidateForMaintenance();
      const nonce = makeNonce();
      transport.request(nonce);
      pending = nonce;
    } catch (error) {
      nextAttemptAt = now() + retryMs;
      onError(error);
    } finally {
      busy = false;
    }
  }

  return {
    tick,
    start() {
      if (timer || stopped) return;
      timer = schedule(() => { void tick(); }, pollMs);
      timer.unref?.();
      void tick();
    },
    stop() {
      stopped = true;
      if (timer) unschedule(timer);
      timer = null;
      login.endMaintenance();
    },
    state: () => ({ nextAt, pending, drainingAt, busy, nextAttemptAt }),
  };
}

function watchNapcatRequests({ transport, restart, now = Date.now, setInterval: schedule = setInterval,
  clearInterval: unschedule = clearInterval, retryMs = RETRY_MS, keepAlive = false, onError = () => {} }) {
  let busy = false;
  let stopped = false;
  let retryAt = 0;
  let timer;
  async function tick() {
    if (busy || stopped || now() < retryAt) return;
    const nonce = transport.readRequest();
    if (!nonce || nonce === transport.readAck()?.nonce) return;
    busy = true;
    try {
      await restart();
      if (!stopped) transport.acknowledge(nonce, now());
    } catch (error) {
      retryAt = now() + retryMs;
      onError(error);
    } finally { busy = false; }
  }
  return {
    tick,
    start() { if (!timer && !stopped) { timer = schedule(() => { void tick(); }, 1000); if (!keepAlive) timer.unref?.(); } },
    stop() { stopped = true; if (timer) unschedule(timer); timer = null; },
  };
}

let singleton = null;
function startNapcatMaintenance(login) {
  if (singleton || !login.launchEnabled() || !process.env.NAPCAT_MAINTENANCE_DIR) return;
  singleton = createMaintenance({
    login,
    transport: fileTransport(process.env.NAPCAT_MAINTENANCE_DIR),
    onError: error => console.warn('[NapCat] 自动维护请求失败，将限频重试:', error.message),
  });
  singleton.start();
}
function stopNapcatMaintenance() {
  singleton?.stop();
  singleton = null;
}

module.exports = { INTERVAL_MS, MAX_WAIT_MS, RETRY_MS, fileTransport, createMaintenance, watchNapcatRequests,
  startNapcatMaintenance, stopNapcatMaintenance };
