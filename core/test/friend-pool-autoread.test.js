const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * 自动补读用例：临时数据目录 + 假的 worker 调用，不碰真实账号。
 */
function loadModules() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'friend-pool-autoread-'));
  const previousDir = process.env.FARM_DATA_DIR;
  process.env.FARM_DATA_DIR = dir;

  const utilsPath = require.resolve('../src/utils/utils');
  const loggerPath = require.resolve('../src/services/logger');
  const previousLogger = require.cache[loggerPath];
  const poolPath = require.resolve('../src/services/friend-pool');
  const autoPath = require.resolve('../src/services/friend-pool-autoread');
  const previousUtils = require.cache[utilsPath];
  const previousPool = require.cache[poolPath];
  require.cache[utilsPath] = {
    id: utilsPath,
    filename: utilsPath,
    loaded: true,
    exports: { log: () => {}, logWarn: () => {} },
  };
  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: { createModuleLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) },
  };
  delete require.cache[poolPath];
  delete require.cache[autoPath];

  const pool = require(poolPath);
  const autoRead = require(autoPath);

  return {
    pool,
    autoRead,
    dir,
    restore() {
      delete require.cache[poolPath];
      delete require.cache[autoPath];
      if (previousPool) require.cache[poolPath] = previousPool;
      if (previousLogger) require.cache[loggerPath] = previousLogger;
      else delete require.cache[loggerPath];
      if (previousUtils) require.cache[utilsPath] = previousUtils;
      if (previousDir === undefined) delete process.env.FARM_DATA_DIR;
      else process.env.FARM_DATA_DIR = previousDir;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

const accounts = [
  { id: 1, name: 'wx-a', platform: 'wx' },
  { id: 2, name: 'wx-b', platform: 'wx' },
  { id: 3, name: 'wx-c', platform: 'wx' },
  { id: 4, name: 'qq', platform: 'qq' },
];

function seedItems(pool, count) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push({ uid: String(7000 + Math.random() * 1e6 | 0), openid: `open-${i}`, shareKey: `key-${i}` });
  }
  pool.upsertInviteItems(items);
}

test('每批最多 2 条、账号轮换用，用完进 24 小时冷却', async (t) => {
  const ctx = loadModules();
  t.after(() => ctx.restore());
  seedItems(ctx.pool, 5);
  const base = Date.now();
  const calls = [];
  const result = await ctx.autoRead.maybeRunDailyAutoRead({
    accounts,
    now: () => base,
    sleep: async () => {},
    callWorkerApi: async (accountId, method, payload) => {
      calls.push({ accountId: String(accountId), method, size: payload.length });
      return { total: payload.length, ok: payload.length, failed: 0 };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.read, 5);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.method, 'fetchSharerLevels');
    assert.ok(call.size <= 2, `每批最多 2 条，实际 ${call.size}`);
    assert.notEqual(call.accountId, '4', 'QQ 账号不参与');
  }
  // 每次换一个账号：3 批用掉 3 个微信账号
  assert.equal(new Set(calls.map(call => call.accountId)).size, 3);
  const state = ctx.pool.getAutoReadState();
  assert.equal(Object.keys(state.accounts).length, 3);
  for (const item of Object.values(state.accounts))
    assert.equal(item.lastRunAt, base);
  // 假 worker 不写等级，所以条目仍然是待读
  assert.equal(result.remaining, 5);
});

test('所有账号都在 24 小时冷却中时跳过，冷却结束后开新一轮', async (t) => {
  const ctx = loadModules();
  t.after(() => ctx.restore());
  // 6 条 → 3 批，正好把 3 个微信账号都用掉
  seedItems(ctx.pool, 6);
  const base = Date.now();
  const ok = async (accountId, method, payload) => ({ total: payload.length, ok: payload.length, failed: 0 });

  const first = await ctx.autoRead.maybeRunDailyAutoRead({
    accounts, now: () => base, sleep: async () => {}, callWorkerApi: ok,
  });
  assert.equal(first.ok, true);

  const cooling = await ctx.autoRead.maybeRunDailyAutoRead({
    accounts,
    now: () => base + 5 * 60 * 1000,
    sleep: async () => {},
    callWorkerApi: async () => { throw new Error('不应该被调用'); },
  });
  assert.equal(cooling.skipped, true);
  assert.match(String(cooling.reason), /24 小时冷却/);
  assert.ok(cooling.nextEligibleAt >= base + 24 * 60 * 60 * 1000);

  seedItems(ctx.pool, 1);
  const nextRound = await ctx.autoRead.maybeRunDailyAutoRead({
    accounts,
    now: () => base + 25 * 60 * 60 * 1000,
    sleep: async () => {},
    callWorkerApi: ok,
  });
  assert.equal(nextRound.ok, true);
  assert.ok(nextRound.read >= 1);
});

test('账号不可用时换号，都不可用就跳过这一轮', async (t) => {
  const ctx = loadModules();
  t.after(() => ctx.restore());
  seedItems(ctx.pool, 2);
  const base = Date.now();

  let attempt = 0;
  const first = await ctx.autoRead.maybeRunDailyAutoRead({
    accounts,
    now: () => base,
    sleep: async () => {},
    callWorkerApi: async (accountId, method, payload) => {
      attempt += 1;
      if (attempt === 1) throw new Error('账号未运行');
      return { total: payload.length, ok: payload.length, failed: 0 };
    },
  });
  assert.equal(first.ok, true);
  assert.equal(first.batches, 1);

  seedItems(ctx.pool, 2);
  const second = await ctx.autoRead.maybeRunDailyAutoRead({
    accounts,
    now: () => base + 5 * 60 * 1000,
    sleep: async () => {},
    callWorkerApi: async () => { throw new Error('账号未运行'); },
  });
  assert.equal(second.skipped, true);
  assert.match(String(second.reason), /账号都不可用/);
});

test('getAutoReadStatus 汇报待读条数与每个账号的冷却剩余', async (t) => {
  const ctx = loadModules();
  t.after(() => ctx.restore());
  seedItems(ctx.pool, 2);
  const base = Date.now();

  const before = ctx.autoRead.getAutoReadStatus(base);
  assert.equal(before.running, false);
  assert.equal(before.missing, 2);
  assert.deepEqual(before.accounts, []);

  await ctx.autoRead.maybeRunDailyAutoRead({
    accounts,
    now: () => base,
    sleep: async () => {},
    callWorkerApi: async (accountId, method, payload) => ({ total: payload.length, ok: payload.length, failed: 0 }),
  });

  const after = ctx.autoRead.getAutoReadStatus(base + 60 * 1000);
  assert.equal(after.running, false);
  assert.equal(after.missing, 2);
  assert.ok(after.accounts.length >= 1);
  for (const entry of after.accounts)
    assert.ok(entry.remainingMs > 0 && entry.remainingMs <= after.cooldownMs);
  assert.ok(after.nextEligibleAt > base);
});

test('号池资料齐全时跳过', async (t) => {
  const ctx = loadModules();
  t.after(() => ctx.restore());
  const result = await ctx.autoRead.maybeRunDailyAutoRead({
    accounts,
    sleep: async () => {},
    callWorkerApi: async () => { throw new Error('不应该被调用'); },
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, '号池资料已齐全');
});

test('距上一条不足 2 分钟时先跳过（少量多次但不刷）', async (t) => {
  const ctx = loadModules();
  t.after(() => ctx.restore());
  seedItems(ctx.pool, 1);
  const base = Date.now();
  const ok = async (accountId, method, payload) => ({ total: payload.length, ok: payload.length, failed: 0 });
  await ctx.autoRead.maybeRunDailyAutoRead({ accounts, now: () => base, sleep: async () => {}, callWorkerApi: ok });
  seedItems(ctx.pool, 1);
  const result = await ctx.autoRead.maybeRunDailyAutoRead({
    accounts,
    now: () => base + 30 * 1000,
    sleep: async () => {},
    callWorkerApi: ok,
  });
  assert.equal(result.skipped, true);
  assert.match(String(result.reason), /不足 2 分钟/);
});