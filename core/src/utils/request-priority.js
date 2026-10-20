const { AsyncLocalStorage } = require('node:async_hooks');

const PRIORITIES = Object.freeze({
  critical: 0,
  foreground: 1,
  farm: 2,
  friend: 3,
  background: 4,
});

const priorityContext = new AsyncLocalStorage();

function normalizePriority(value) {
  const key = String(value || '').toLowerCase();
  return Object.hasOwn(PRIORITIES, key) ? key : 'foreground';
}

function runWithRequestPriority(priority, fn) {
  return priorityContext.run(normalizePriority(priority), fn);
}

function getRequestPriority(fallback = 'foreground') {
  return normalizePriority(priorityContext.getStore() || fallback);
}

/** 并发上限默认值：拟真真机小程序的同时在途请求模型（保守值） */
const DEFAULT_MAX_ACTIVE = 2;
const DEFAULT_MAX_QUEUED = 100;
/** 出队节流基线间隔（ms）：相邻两次真正放行的最小间隔 */
const DEFAULT_SEND_INTERVAL_BASE_MS = 250;
/** 出队节流随机抖动上限（ms）：0~150ms，让间隔不完全均匀、更像真人 */
const DEFAULT_SEND_INTERVAL_JITTER_MS = 150;

function createRequestGate(options = {}) {
  const maxActive = Math.max(1, Number(options.maxActive) || DEFAULT_MAX_ACTIVE);
  const maxQueued = Math.max(1, Number(options.maxQueued) || DEFAULT_MAX_QUEUED);
  const sendIntervalBaseMs = Math.max(0, Math.round(
    options.sendIntervalBaseMs === undefined
      ? DEFAULT_SEND_INTERVAL_BASE_MS
      : Number(options.sendIntervalBaseMs),
  ));
  const sendIntervalJitterMs = Math.max(0, Math.round(
    options.sendIntervalJitterMs === undefined
      ? DEFAULT_SEND_INTERVAL_JITTER_MS
      : Number(options.sendIntervalJitterMs),
  ));
  let active = 0;
  let order = 0;
  // 下一次允许放行的时刻（出队节流的时间戳，保证全局发送间隔）
  let nextSendAt = 0;
  const queue = [];

  function drain() {
    queue.sort((a, b) => PRIORITIES[a.priority] - PRIORITIES[b.priority] || a.order - b.order);
    while (active < maxActive && queue.length > 0) {
      const entry = queue.shift();
      active++;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
        drain();
      };
      // 出队拟真节流：每个请求出队后强制等待「基线间隔 + 0~抖动」才放行
      // （约 250~400ms）。无论上层多少任务（收菜/做奶茶/好友/任务）同时触发，
      // 底层都平滑排队按人类手速发送，避免瞬间打出上百个包被网关风控静默拉黑
      // （表现为心跳无响应 → 心跳超时 → 掉线循环）。
      // 注意：等待期间占用水位槽位，因此节流会同步降低有效并发吞吐。
      const now = Date.now();
      const waitMs = Math.max(0, nextSendAt - now)
        + sendIntervalBaseMs
        + (sendIntervalJitterMs > 0
          ? Math.floor(Math.random() * (sendIntervalJitterMs + 1))
          : 0);
      nextSendAt = now + waitMs;
      if (waitMs > 0) {
        setTimeout(() => entry.resolve(release), waitMs);
      } else {
        entry.resolve(release);
      }
    }
  }

  function acquire(priority) {
    if (queue.length >= maxQueued) {
      return Promise.reject(new Error(`请求调度队列已满: queued=${queue.length}`));
    }
    return new Promise((resolve) => {
      queue.push({ priority: normalizePriority(priority), order: order++, resolve });
      drain();
    });
  }

  function snapshot() {
    return {
      active,
      queued: queue.length,
      pacing: { baseMs: sendIntervalBaseMs, jitterMs: sendIntervalJitterMs },
      byPriority: queue.reduce((result, item) => {
        result[item.priority] = (result[item.priority] || 0) + 1;
        return result;
      }, {}),
    };
  }

  return { acquire, snapshot };
}

module.exports = {
  PRIORITIES,
  normalizePriority,
  runWithRequestPriority,
  getRequestPriority,
  createRequestGate,
};
