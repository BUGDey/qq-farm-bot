const { AsyncLocalStorage } = require('node:async_hooks');

const PRIORITIES = Object.freeze({
  critical: 0,
  foreground: 1,
  farm: 2,
  friend: 3,
  background: 4,
});

/** 非抢占班次：这些班次不会占用"预留槽"，其余班次要给 critical 让路 */
const RESERVED_FOR_CRITICAL = new Set(['farm', 'friend', 'background']);

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

/**
 * 各班次容量（在途 / 排队）。
 * 与总并发上限取较小值，因此默认开启也不会比旧行为更激进。
 */
const DEFAULT_CLASS_LIMITS = Object.freeze({
  critical: { active: 2, queued: 8 },
  foreground: { active: 3, queued: 60 },
  farm: { active: 2, queued: 40 },
  friend: { active: 2, queued: 30 },
  background: { active: 1, queued: 10 },
});

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

  // 分班次容量：perClassLimits === false 时退化成旧行为（只有全局上限）
  const classLimits = (() => {
    if (options.perClassLimits === false) return null;
    const custom = options.classLimits && typeof options.classLimits === 'object' ? options.classLimits : {};
    const result = {};
    for (const key of Object.keys(DEFAULT_CLASS_LIMITS)) {
      const base = DEFAULT_CLASS_LIMITS[key];
      const patch = custom[key] || {};
      result[key] = {
        active: Math.max(1, Number(patch.active) || base.active),
        queued: Math.max(1, Number(patch.queued) || base.queued),
      };
    }
    return result;
  })();

  /** 非前台班次（farm/friend/background）合计在途上限，0 表示不限制 */
  const nonForegroundActiveCap = Math.max(0, Math.round(Number(options.nonForegroundActiveCap) || 0));
  /** 排队超过该时长后提升到前台档位，避免低班次饿死（0 = 关闭） */
  const starvationMs = Math.max(0, Math.round(Number(options.starvationMs) || 0));
  /** background 只在"完全空闲"（无在途、无非后台排队）时放行 */
  const backgroundIdleOnly = options.backgroundIdleOnly === true;

  let active = 0;
  let order = 0;
  let nextSendAt = 0;
  const queue = [];
  const activeByPriority = Object.create(null);

  function countQueued(priority) {
    let count = 0;
    for (const item of queue) if (item.priority === priority) count++;
    return count;
  }

  function countActiveNonForeground() {
    return (activeByPriority.farm || 0) + (activeByPriority.friend || 0) + (activeByPriority.background || 0);
  }

  function queuedHasCritical() {
    for (const item of queue) if (item.priority === 'critical') return true;
    return false;
  }

  function effectivePriority(item, now) {
    if (starvationMs > 0 && item.priority !== 'background' && now - item.enqueuedAt >= starvationMs) {
      return 'foreground';
    }
    return item.priority;
  }

  function canDispatch(item, now) {
    if (active >= maxActive) return false;
    if (classLimits) {
      const limit = classLimits[item.priority];
      if (limit && (activeByPriority[item.priority] || 0) >= limit.active) return false;
    }
    if (nonForegroundActiveCap > 0
      && RESERVED_FOR_CRITICAL.has(item.priority)
      && countActiveNonForeground() >= nonForegroundActiveCap) {
      return false;
    }
    // 给 critical 预留一个槽位：有 critical 在排队时，非 critical 最多用到 maxActive-1
    if (item.priority !== 'critical' && maxActive > 1 && queuedHasCritical() && active >= maxActive - 1) {
      return false;
    }
    if (backgroundIdleOnly && item.priority === 'background') {
      if (active > 0) return false;
      for (const other of queue) {
        if (other !== item && other.priority !== 'background') return false;
      }
    }
    return true;
  }

  function drain() {
    const now = Date.now();
    queue.sort((a, b) => {
      const rankA = PRIORITIES[effectivePriority(a, now)];
      const rankB = PRIORITIES[effectivePriority(b, now)];
      return rankA - rankB || a.order - b.order;
    });
    while (queue.length > 0) {
      let picked = -1;
      for (let i = 0; i < queue.length; i++) {
        if (canDispatch(queue[i], now)) {
          picked = i;
          break;
        }
      }
      if (picked < 0) return;
      const [entry] = queue.splice(picked, 1);
      active++;
      activeByPriority[entry.priority] = (activeByPriority[entry.priority] || 0) + 1;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
        activeByPriority[entry.priority] = Math.max(0, (activeByPriority[entry.priority] || 1) - 1);
        drain();
      };
      // 出队拟真节流：每个请求出队后强制等待「基线间隔 + 0~抖动」才放行
      // （约 250~400ms）。无论上层多少任务（收菜/做奶茶/好友/任务）同时触发，
      // 底层都平滑排队按人类手速发送，避免瞬间打出上百个包被网关风控静默拉黑
      // （表现为心跳无响应 → 心跳超时 → 掉线循环）。
      // 注意：等待期间占用水位槽位，因此节流会同步降低有效并发吞吐。
      const sentAt = Date.now();
      const waitMs = Math.max(0, nextSendAt - sentAt)
        + sendIntervalBaseMs
        + (sendIntervalJitterMs > 0
          ? Math.floor(Math.random() * (sendIntervalJitterMs + 1))
          : 0);
      nextSendAt = sentAt + waitMs;
      if (waitMs > 0) {
        setTimeout(() => entry.resolve(release), waitMs);
      } else {
        entry.resolve(release);
      }
    }
  }

  /**
   * 申请一个发送槽位。
   * @param {string} priority critical / foreground / farm / friend / background
   * @param {{queueTimeoutMs?: number}} [acquireOptions] 排队超时（超时 reject，error.errorType='gateway_busy'）
   */
  function acquire(priority, acquireOptions = {}) {
    const lane = normalizePriority(priority);
    if (queue.length >= maxQueued) {
      return Promise.reject(new Error(`请求调度队列已满: queued=${queue.length}`));
    }
    if (classLimits) {
      const limit = classLimits[lane];
      if (limit && countQueued(lane) >= limit.queued) {
        const error = new Error(`请求调度队列已满: ${lane}=${countQueued(lane)}`);
        error.errorType = 'gateway_busy';
        error.priority = lane;
        return Promise.reject(error);
      }
    }
    return new Promise((resolve, reject) => {
      const entry = { priority: lane, order: order++, enqueuedAt: Date.now(), resolve, reject: null, timer: null };
      const timeoutMs = Math.max(0, Number(acquireOptions.queueTimeoutMs) || 0);
      if (timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          const index = queue.indexOf(entry);
          if (index < 0) return;
          queue.splice(index, 1);
          const error = new Error(`请求排队超时（${lane}，${Math.round(timeoutMs / 1000)}s），留到下一轮再试`);
          error.errorType = 'gateway_busy';
          error.priority = lane;
          reject(error);
          drain();
        }, timeoutMs);
        if (entry.timer.unref) entry.timer.unref();
      }
      const rawResolve = entry.resolve;
      entry.resolve = (release) => {
        if (entry.timer) {
          clearTimeout(entry.timer);
          entry.timer = null;
        }
        rawResolve(release);
      };
      queue.push(entry);
      drain();
    });
  }

  function snapshot() {
    const now = Date.now();
    let oldestWaitMs = 0;
    for (const item of queue) {
      const waited = now - item.enqueuedAt;
      if (waited > oldestWaitMs) oldestWaitMs = waited;
    }
    return {
      active,
      queued: queue.length,
      pacing: { baseMs: sendIntervalBaseMs, jitterMs: sendIntervalJitterMs },
      byPriority: queue.reduce((result, item) => {
        result[item.priority] = (result[item.priority] || 0) + 1;
        return result;
      }, {}),
      activeByPriority: { ...activeByPriority },
      oldestWaitMs,
      waitingCritical: queue.some(item => item.priority === 'critical'),
      limits: classLimits ? { ...classLimits, nonForegroundActiveCap, starvationMs, backgroundIdleOnly } : null,
    };
  }

  return { acquire, snapshot };
}

/** 判断一个错误是否属于"网关忙、本轮应跳过"的让位错误 */
function isGatewayBusyError(error) {
  return !!(error && (error.errorType === 'gateway_busy' || error.name === 'GatewayBusyError'));
}

module.exports = {
  PRIORITIES,
  DEFAULT_CLASS_LIMITS,
  normalizePriority,
  runWithRequestPriority,
  getRequestPriority,
  createRequestGate,
  isGatewayBusyError,
};
