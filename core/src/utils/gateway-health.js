// Login deadline; independent of sustained transport silence.
const NETWORK_TIMEOUT_MS = 10000;
const NETWORK_CHECK_INTERVAL_MS = 1000;
const CONNECTION_SILENCE_MS = 60000;
function shouldTerminateGateway({ inboundAgeMs = 0, pendingCount = 0 } = {}) {
  return pendingCount > 0 && inboundAgeMs >= CONNECTION_SILENCE_MS;
}

function getOldestPendingAgeMs(startedAtValues, now = Date.now()) {
  const values = Array.from(startedAtValues || []).filter(Number.isFinite);
  if (values.length === 0) return 0;
  return Math.max(0, now - Math.min(...values));
}

function evaluateGatewayHealth(input = {}) {
  const connected = input.connected !== false;
  const oldestPendingAgeMs = Math.max(0, Number(input.oldestPendingAgeMs) || 0);
  const pendingLimitMs = Math.max(1000, Number(input.pendingLimitMs) || 5000);

  if (!connected) return { healthy: false, reason: 'disconnected' };
  if (Number(input.heartbeatMisses ?? input.heartbeatMissCount) > 0) return { healthy: false, reason: 'heartbeat_missed' };
  if (oldestPendingAgeMs >= pendingLimitMs) return { healthy: false, reason: 'request_stuck' };
  return { healthy: true, reason: 'ok' };
}

function canRunBackground({ healthy = false, businessActive = 0, businessQueued = 0,
  sceneActive = false, sceneQueued = 0 } = {}) {
  return healthy && businessActive === 0 && businessQueued === 0 && !sceneActive && sceneQueued === 0;
}

function nextBusinessBackoffMs(previousMs = 0, minimumMs = 30000, maximumMs = 60000) {
  const min = Math.max(1000, Number(minimumMs) || 30000);
  const max = Math.max(min, Number(maximumMs) || 60000);
  const previous = Math.max(0, Number(previousMs) || 0);
  return previous > 0 ? Math.min(max, previous * 2) : min;
}

module.exports = { NETWORK_TIMEOUT_MS, NETWORK_CHECK_INTERVAL_MS, shouldTerminateGateway, canRunBackground, getOldestPendingAgeMs, evaluateGatewayHealth, nextBusinessBackoffMs };
