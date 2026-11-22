const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * 好友号池用例：每个用例用独立临时数据目录，避免污染真实 data/friend-pool.json
 * （runtime-paths 在调用时读 FARM_DATA_DIR，所以只要在 require 前设好即可）
 */
function loadPool() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'friend-pool-'));
  const previousDir = process.env.FARM_DATA_DIR;
  process.env.FARM_DATA_DIR = dir;

  // utils 里的文件日志会异步往 data/logs 写，临时目录被删掉后会抛 ENOENT，这里替身为空实现
  const utilsPath = require.resolve('../src/utils/utils');
  const poolPath = require.resolve('../src/services/friend-pool');
  const previousUtils = require.cache[utilsPath];
  const previousPool = require.cache[poolPath];
  require.cache[utilsPath] = {
    id: utilsPath,
    filename: utilsPath,
    loaded: true,
    exports: { log: () => {}, logWarn: () => {} },
  };
  delete require.cache[poolPath];

  const pool = require(poolPath);
  return {
    pool,
    dir,
    filePath: path.join(dir, 'friend-pool.json'),
    readFile() {
      return JSON.parse(fs.readFileSync(path.join(dir, 'friend-pool.json'), 'utf8'));
    },
    restore() {
      delete require.cache[poolPath];
      if (previousPool) require.cache[poolPath] = previousPool;
      if (previousUtils) require.cache[utilsPath] = previousUtils;
      else delete require.cache[utilsPath];
      if (previousDir === undefined) delete process.env.FARM_DATA_DIR;
      else process.env.FARM_DATA_DIR = previousDir;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function entryFor(ctx, accountId, uid) {
  return ctx.pool.getPoolSnapshot(accountId).entries.find(item => item.uid === String(uid));
}

test('upsertInviteItems 收录新链接，同 uid 只留一条', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  const first = ctx.pool.upsertInviteItems([
    { uid: '1001', openid: 'open-a', shareKey: 'k1', cardTime: '2026-11-20 10:00:00' },
    { uid: '1002', openid: 'open-b', shareKey: 'k2' },
  ]);
  assert.deepEqual(first, { added: 2, updated: 0, removed: 0 });

  const snapshot = ctx.pool.getPoolSnapshot('acc1');
  assert.equal(snapshot.summary.total, 2);
  assert.equal(snapshot.summary.new, 2);
});

test('导入按 openid 去重：重复的只留卡片最新的一条，并合并申请状态', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  // 同一个人（openid 相同）被采到两次，uid 不同、share_key 不同
  ctx.pool.upsertInviteItems([
    { uid: '3001', openid: 'open-same', shareKey: 'key-a', cardTime: '2026-11-20 10:00:00' },
  ]);
  ctx.pool.markApplied('acc1', '3001', {});
  const result = ctx.pool.upsertInviteItems([
    { uid: '3002', openid: 'open-same', shareKey: 'key-b', cardTime: '2026-11-21 10:00:00' },
  ]);
  // 同一个人按 openid 命中已有条目，只更新卡片，不再多出一条
  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.removed, 0);
  const entries = ctx.pool.getPoolSnapshot('acc1').entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].uid, '3001');
  assert.equal(entries[0].shareKey, 'key-b');
  // 申请状态跟着这条身份走，不丢
  assert.equal(entries[0].status, 'pending');
});

test('dedupePool 清理历史重复：同 openid 保留卡片最新的那条', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  // 直接写池子，模拟已经存在的重复数据（绕过导入去重）
  ctx.pool.upsertInviteItems([
    { uid: '4001', openid: 'dup-openid', shareKey: 'k1', cardTime: '2026-11-18 10:00:00' },
  ]);
  const raw = JSON.parse(fs.readFileSync(ctx.filePath, 'utf8'));
  raw.items['4002'] = {
    ...raw.items['4001'],
    uid: '4002',
    shareKey: 'k2',
    cardTime: '2026-11-22 10:00:00',
    updatedAt: Date.now(),
  };
  fs.writeFileSync(ctx.filePath, JSON.stringify(raw));

  const removed = ctx.pool.dedupePool();
  assert.equal(removed, 1);
  const entries = ctx.pool.getPoolSnapshot('acc1').entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].uid, '4002');
});

test('updateItemProfile 只更新「识别时间」也会落盘', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());
  ctx.pool.upsertInviteItems([{ uid: '5001', openid: 'o-5001', shareKey: 'k-5001' }]);

  const ts = Date.now();
  ctx.pool.updateItemProfile('5001', { levelFetchedAt: ts, dogFetchedAt: ts });

  const raw = JSON.parse(fs.readFileSync(ctx.filePath, 'utf8'));
  assert.equal(raw.items['5001'].levelFetchedAt, ts);
  assert.equal(raw.items['5001'].dogFetchedAt, ts);
});

test('upsertInviteItems 同 uid 以卡片时间最新的为准（更旧的卡片不覆盖）', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  ctx.pool.upsertInviteItems([
    { uid: '2001', openid: 'open-old', shareKey: 'key-old', cardTime: '2026-11-19 09:00:00' },
  ]);
  // 后插入一张更旧的卡片（扫描顺序更晚但时间更早）——不应把 key 改回旧的
  ctx.pool.upsertInviteItems([
    { uid: '2001', openid: 'open-older', shareKey: 'key-older', cardTime: '2026-11-18 08:00:00' },
  ]);
  let entry = entryFor(ctx, 'acc1', '2001');
  assert.equal(entry.shareKey, 'key-old');
  assert.equal(entry.cardTime, '2026-11-19 09:00:00');

  // 再来一张更新的卡片：覆盖
  ctx.pool.upsertInviteItems([
    { uid: '2001', openid: 'open-new', shareKey: 'key-new', cardTime: '2026-11-21 12:00:00' },
  ]);
  entry = entryFor(ctx, 'acc1', '2001');
  assert.equal(entry.shareKey, 'key-new');
  assert.equal(entry.cardTime, '2026-11-21 12:00:00');
  assert.equal(ctx.pool.getPoolSnapshot('acc1').summary.total, 1);
});

test('新粘贴的链接（无卡片时间）会更新 share_key，但不覆盖申请历史', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  ctx.pool.upsertInviteItems([
    { uid: '9201', openid: 'open-a', shareKey: 'key-old', cardTime: '2026-11-20 10:00:00' },
  ]);
  ctx.pool.markApplied('acc1', '9201', { shareKey: 'key-old', name: '老王', level: 18 });
  const before = entryFor(ctx, 'acc1', '9201');

  // 后续粘贴 txt 链接：没有 cardTime，但确实是新卡片
  ctx.pool.upsertInviteItems([{ uid: '9201', openid: 'open-a', shareKey: 'key-new' }]);
  const after = entryFor(ctx, 'acc1', '9201');

  assert.equal(after.shareKey, 'key-new');
  assert.equal(after.status, 'pending');
  assert.equal(after.applyCount, before.applyCount);
  assert.equal(after.lastApplyAt, before.lastApplyAt);
  assert.equal(after.name, '老王');
  assert.equal(after.level, 18);
});

test('重复导入不会重置已有申请记录', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  ctx.pool.upsertInviteItems([{ uid: '3001', openid: 'open-a', shareKey: 'k1' }]);
  ctx.pool.markApplied('acc1', '3001', { openid: 'open-a', shareKey: 'k1', name: '小明', level: 33 });

  ctx.pool.upsertInviteItems([{ uid: '3001', openid: 'open-a', shareKey: 'k1' }]);
  const entry = entryFor(ctx, 'acc1', '3001');
  assert.equal(entry.status, 'pending');
  assert.equal(entry.applyCount, 1);
  assert.ok(entry.lastApplyAt > 0);
});

test('链接库全账号共享，申请状态按账号分开', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  ctx.pool.upsertInviteItems([{ uid: '9101', openid: 'open-a', shareKey: 'k1' }]);

  // 两个账号都能看到同一条链接
  assert.equal(ctx.pool.getPoolSnapshot('acc1').summary.total, 1);
  assert.equal(ctx.pool.getPoolSnapshot('acc2').summary.total, 1);

  // 账号 1 申请后：账号 1 待通过，账号 2 仍未申请（各自独立次数/时间）
  ctx.pool.markApplied('acc1', '9101', {});
  assert.equal(ctx.pool.peekStatus('acc1', '9101'), 'pending');
  assert.equal(ctx.pool.peekStatus('acc2', '9101'), 'new');
  assert.equal(ctx.pool.getPoolSnapshot('acc1').summary.pending, 1);
  assert.equal(ctx.pool.getPoolSnapshot('acc2').summary.pending, 0);

  const acc2Entry = entryFor(ctx, 'acc2', '9101');
  assert.equal(acc2Entry.lastApplyAt, null);
  assert.equal(acc2Entry.applyCount, 0);

  // 账号 2 独立申请，只累加自己的次数
  ctx.pool.markApplied('acc2', '9101', {});
  assert.equal(ctx.pool.getPoolSnapshot('acc1').entries[0].applyCount, 1);
  assert.equal(ctx.pool.getPoolSnapshot('acc2').entries[0].applyCount, 1);
});

test('账号 1 标记不可加不影响账号 2', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  ctx.pool.upsertInviteItems([{ uid: '9111', openid: 'open-a', shareKey: 'k1' }]);
  ctx.pool.markApplied('acc1', '9111', {});
  ctx.pool.markDead('acc1', '9111', '超时');

  assert.equal(ctx.pool.peekStatus('acc1', '9111'), 'dead');
  assert.equal(ctx.pool.peekStatus('acc2', '9111'), 'new');
  assert.equal(ctx.pool.getPoolSnapshot('acc1').summary.dead, 1);
  assert.equal(ctx.pool.getPoolSnapshot('acc2').summary.dead, 0);
});

test('账号 1 已是好友，账号 2 仍可申请', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  ctx.pool.upsertInviteItems([{ uid: '9121', openid: 'open-a', shareKey: 'k1' }]);
  ctx.pool.markFriend('acc1', '9121');

  assert.equal(ctx.pool.peekStatus('acc1', '9121'), 'friend');
  assert.equal(ctx.pool.peekStatus('acc2', '9121'), 'new');
});

test('computeStatus：申请满 24 小时未通过记为已过期，未满为待通过', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  const hour = 60 * 60 * 1000;

  assert.equal(ctx.pool.computeStatus(null, now), 'new');
  assert.equal(ctx.pool.computeStatus({ status: 'new' }, now), 'new');
  assert.equal(ctx.pool.computeStatus({ status: 'pending', lastApplyAt: now - 23 * hour }, now), 'pending');
  assert.equal(ctx.pool.computeStatus({ status: 'pending', lastApplyAt: now - 24 * hour }, now), 'expired');
  assert.equal(ctx.pool.computeStatus({ status: 'friend', lastApplyAt: now - 100 * hour }, now), 'friend');
  assert.equal(ctx.pool.computeStatus({ status: 'new', lastApplyAt: now - 25 * hour }, now), 'expired');
  assert.equal(ctx.pool.computeStatus({ status: 'dead', lastApplyAt: now - 25 * hour, deadReason: '好友位已满' }, now), 'dead');
  // 旧版本把超期落盘成 dead 的记录，读出来仍按「已过期」显示
  assert.equal(ctx.pool.computeStatus({ status: 'dead', lastApplyAt: now - 30 * hour, deadReason: '申请超过 24 小时未通过' }, now), 'expired');
  assert.equal(ctx.pool.computeStatus({ status: 'new', lastApplyAt: now - hour }, now), 'pending');
});

test('getPoolSnapshot 把超期 pending 记为已过期，不落盘成已拒绝', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  const old = Date.now() - 25 * 60 * 60 * 1000;
  const fresh = Date.now() - 2 * 60 * 60 * 1000;
  fs.writeFileSync(ctx.filePath, JSON.stringify({
    version: 2,
    items: {
      4001: { uid: '4001', shareKey: 'k1' },
      4002: { uid: '4002', shareKey: 'k2' },
      4003: { uid: '4003', shareKey: 'k3' },
    },
    applies: {
      acc1: {
        4001: { status: 'pending', lastApplyAt: old, applyCount: 1 },
        4002: { status: 'pending', lastApplyAt: fresh, applyCount: 1 },
        4003: { status: 'friend' },
      },
    },
  }), 'utf8');

  const snapshot = ctx.pool.getPoolSnapshot('acc1');
  assert.equal(snapshot.summary.total, 3);
  assert.equal(snapshot.summary.expired, 1);
  assert.equal(snapshot.summary.dead, 0);
  assert.equal(snapshot.summary.pending, 1);
  assert.equal(snapshot.summary.friend, 1);
  assert.equal(snapshot.entries.find(entry => entry.uid === '4001').status, 'expired');

  // 过期只是显示状态，不能把账号的申请记录改写成「已拒绝」
  const saved = ctx.readFile();
  assert.equal(saved.applies.acc1['4001'].status, 'pending');
  assert.equal(saved.applies.acc1['4001'].deadAt, undefined);
});

test('resetEntry 把 dead 恢复为可申请', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  ctx.pool.upsertInviteItems([{ uid: '6001', openid: 'open-a', shareKey: 'k1' }]);
  ctx.pool.markApplied('acc1', '6001', {});
  ctx.pool.markDead('acc1', '6001', '超时');
  assert.equal(ctx.pool.getPoolSnapshot('acc1').summary.dead, 1);

  assert.equal(ctx.pool.resetEntry('acc1', '6001'), true);
  const entry = entryFor(ctx, 'acc1', '6001');
  assert.equal(entry.status, 'new');
  assert.equal(entry.lastApplyAt, null);
  assert.equal(entry.deadAt, null);
  assert.equal(ctx.pool.resetEntry('acc1', 'nope'), false);
});

test('markFriends 批量把已加为好友的条目置为 friend（仅当前账号）', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  ctx.pool.upsertInviteItems([
    { uid: '7001', openid: 'open-a', shareKey: 'k1' },
    { uid: '7002', openid: 'open-b', shareKey: 'k2' },
    { uid: '7003', openid: 'open-c', shareKey: 'k3' },
  ]);
  ctx.pool.markApplied('acc1', '7001', {});
  ctx.pool.markApplied('acc1', '7002', {});

  const changed = ctx.pool.markFriends('acc1', ['7001', '7002', '8888']);
  assert.equal(changed, 2);
  const snapshot = ctx.pool.getPoolSnapshot('acc1');
  assert.equal(snapshot.summary.friend, 2);
  assert.equal(snapshot.summary.new, 1);
  // 别的账号不受影响
  assert.equal(ctx.pool.getPoolSnapshot('acc2').summary.friend, 0);
});

test('removeEntry 删除共享链接，并清掉所有账号对它的状态', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  ctx.pool.upsertInviteItems([{ uid: '9101', openid: 'open-a', shareKey: 'k1' }]);
  ctx.pool.markApplied('acc1', '9101', {});
  ctx.pool.markApplied('acc2', '9101', {});

  assert.equal(ctx.pool.removeEntry('9101'), true);
  assert.equal(ctx.pool.getPoolSnapshot('acc1').summary.total, 0);
  assert.equal(ctx.pool.getPoolSnapshot('acc2').summary.total, 0);
  assert.equal(ctx.readFile().applies.acc1['9101'], undefined);
  assert.equal(ctx.pool.removeEntry('9101'), false);
});

test('号池文件损坏时重置为空池，不抛错', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  fs.writeFileSync(ctx.filePath, '{ this is not json', 'utf8');
  const snapshot = ctx.pool.getPoolSnapshot('acc1');
  assert.equal(snapshot.summary.total, 0);
  assert.deepEqual(snapshot.entries, []);
});

test('旧版按账号存储的数据会自动迁移为共享链接 + 分账号状态', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  // v1 格式：两个账号各存一份同 uid 的完整条目
  fs.writeFileSync(ctx.filePath, JSON.stringify({
    version: 1,
    accounts: {
      4: {
        1234: {
          uid: '1234', openid: 'open-a', shareKey: 'key-a',
          status: 'pending', lastApplyAt: Date.now() - 60 * 60 * 1000, applyCount: 2, name: '老张', level: 20,
        },
      },
      9: {
        1234: {
          uid: '1234', openid: 'open-a', shareKey: 'key-a',
          status: 'friend', lastApplyAt: Date.now() - 120 * 60 * 1000, applyCount: 1,
        },
      },
    },
  }), 'utf8');

  // 迁移后：链接只有一条，两个账号各自保留自己的状态
  assert.equal(ctx.pool.getPoolSnapshot('4').summary.total, 1);
  assert.equal(ctx.pool.getPoolSnapshot('9').summary.total, 1);

  const acc4 = ctx.pool.getPoolSnapshot('4').entries[0];
  assert.equal(acc4.status, 'pending');
  assert.equal(acc4.applyCount, 2);
  assert.equal(acc4.name, '老张');
  assert.equal(acc4.level, 20);

  const acc9 = ctx.pool.getPoolSnapshot('9').entries[0];
  assert.equal(acc9.status, 'friend');
  assert.equal(acc9.applyCount, 1);

  // 迁移结果落盘为 v2
  const saved = ctx.readFile();
  assert.equal(saved.version, 2);
  assert.ok(saved.items['1234']);
  assert.ok(saved.applies['4']['1234']);
  assert.ok(saved.applies['9']['1234']);
});

test('markDailyLimit 当天生效，跨天自动失效', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());

  assert.equal(ctx.pool.isDailyLimitBlocked('4'), false);

  ctx.pool.markDailyLimit('4', 'code=1005027 今日发出的好友申请已达上限');
  const state = ctx.pool.getDailyLimitState('4');
  assert.equal(state.blocked, true);
  assert.equal(state.dateKey, ctx.pool.dayKeyOf());
  assert.match(state.error, /1005027/);

  // 只影响撞过上限的账号
  assert.equal(ctx.pool.isDailyLimitBlocked('9'), false);

  // 换到明天：日期 key 不同，标记自动失效
  const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
  assert.equal(ctx.pool.isDailyLimitBlocked('4', tomorrow), false);
  assert.equal(ctx.pool.getDailyLimitState('4', tomorrow).blocked, false);

  // 记到文件里，容器重启后依然生效
  const saved = ctx.readFile();
  assert.equal(saved.limits['4'].dateKey, ctx.pool.dayKeyOf());

  // 手动解除
  assert.equal(ctx.pool.clearDailyLimit('4'), true);
  assert.equal(ctx.pool.isDailyLimitBlocked('4'), false);
});

test('拜访关闭单独统计，并从「正常」里排除；申请成功后自动清除', () => {
  const ctx = loadPool();
  try {
    ctx.pool.upsertInviteItems([
      { uid: 'v1', openid: 'o1', shareKey: 'k1' },
      { uid: 'v2', openid: 'o2', shareKey: 'k2' },
      { uid: 'v3', openid: 'o3', shareKey: 'k3' },
    ]);

    // v1 拜访关闭
    assert.equal(ctx.pool.markVisitClosed('v1', 'code=1002007'), true);
    let overview = ctx.pool.getPoolOverview();
    const entry = overview.entries.find(item => item.uid === 'v1');
    assert.equal(entry.visitClosed, true);
    assert.equal(overview.summary.visitClosed, 1);
    assert.equal(overview.summary.valid, 2);
    assert.equal(overview.summary.expired, 0);
    assert.equal(overview.summary.total, 3);

    // 申请成功后标记作废，回到「正常」
    ctx.pool.markApplied('acc1', 'v1', { openid: 'o1', shareKey: 'k1' });
    overview = ctx.pool.getPoolOverview();
    assert.equal(overview.entries.find(item => item.uid === 'v1').visitClosed, undefined);
    assert.equal(overview.summary.visitClosed, 0);
    assert.equal(overview.summary.valid, 3);

    // 号池里没有的 uid 不会被写入
    assert.equal(ctx.pool.markVisitClosed('nope'), false);
  }
  finally {
    ctx.restore();
  }
});

test('犬种三态：识别出品种 / 确认无狗 / 未知（没读到不能当无狗）', (t) => {
  const ctx = loadPool();
  t.after(() => ctx.restore());
  ctx.pool.upsertInviteItems([
    { uid: '6001', openid: 'o-6001', shareKey: 'k-6001' },
    { uid: '6002', openid: 'o-6002', shareKey: 'k-6002' },
    { uid: '6003', openid: 'o-6003', shareKey: 'k-6003' },
  ]);
  const ts = Date.now();
  ctx.pool.updateItemProfile('6001', { dogBreed: '柯基', dogFetchedAt: ts });
  ctx.pool.updateItemProfile('6002', { dogAbsent: true, dogFetchedAt: ts });

  const stats = ctx.pool.computeFilterStats('acc1', {});
  assert.equal(stats.dogCounts['柯基'], 1);
  assert.equal(stats.dogCounts['无狗'], 1);
  assert.equal(stats.dogCounts['未知'], 1);

  // 以后读到品种就清掉「无狗」结论
  ctx.pool.updateItemProfile('6002', { dogBreed: '比熊犬', dogFetchedAt: ts + 1 });
  const after = ctx.pool.computeFilterStats('acc1', {});
  assert.equal(after.dogCounts['无狗'], 0);
  assert.equal(after.dogCounts['比熊犬'], 1);

  // 只写过识别时间、没有狗结论的条目仍算「待读」，不会被当成无狗
  ctx.pool.updateItemProfile('6003', { levelFetchedAt: ts });
  assert.equal(ctx.pool.getItemsMissingProfile(10).some(item => item.uid === '6003'), true);
});
