const test = require('node:test');
const assert = require('node:assert/strict');

function mockModule(filename, exports) {
  return { id: filename, filename, loaded: true, exports };
}

/**
 * 内存版好友号池：替身必须自己持有状态，否则会读写真实 data/friend-pool.json，
 * 导致用例之间互相串状态（前一条把 uid 写成 pending，后一条就被当成已申请跳过）。
 *
 * 与线上一致：链接库全账号共享（items），申请状态按账号分开（states）。
 */
function createFakePool(seed = {}) {
  /** @type {Map<string, any>} uid -> 卡片信息 */
  const items = new Map();
  /** @type {Map<string, Map<string, any>>} accountId -> uid -> 申请状态 */
  const accounts = new Map();
  const entriesFor = (accountId) => {
    const key = String(accountId || 'default');
    if (!accounts.has(key))
      accounts.set(key, new Map());
    return accounts.get(key);
  };
  const ensureEntry = (accountId, uid) => {
    const map = entriesFor(accountId);
    if (!map.has(String(uid))) {
      map.set(String(uid), { uid: String(uid), status: 'new', lastApplyAt: null, applyCount: 0, name: '', level: null });
    }
    return map.get(String(uid));
  };
  for (const [uid, status] of Object.entries(seed)) {
    items.set(String(uid), { uid: String(uid), shareKey: '', cardTime: '', openid: '' });
    ensureEntry('default', uid).status = status;
    if (status === 'pending') {
      const entry = ensureEntry('default', uid);
      entry.lastApplyAt = Date.now() - 60 * 1000;
      entry.applyCount = 1;
    }
  }
  return {
    items,
    entriesFor,
    upsertInviteItems(list) {
      let added = 0;
      let updated = 0;
      for (const item of Array.isArray(list) ? list : []) {
        const uid = String((item && item.uid) || '').trim();
        if (!uid) continue;
        const incomingKey = String((item && (item.shareKey || item.share_key)) || '');
        const existing = items.get(uid);
        if (!existing) {
          items.set(uid, { uid, shareKey: incomingKey, cardTime: String((item && item.cardTime) || ''), openid: String((item && item.openid) || '') });
          added++;
        }
        else {
          if (incomingKey) existing.shareKey = incomingKey;
          updated++;
        }
        // 共享链接对每个已存在的账号都可见
        for (const accountId of accounts.keys()) ensureEntry(accountId, uid);
        ensureEntry('default', uid);
      }
      return { added, updated };
    },
    markApplied(accountId, uid, extra = {}) {
      const item = items.get(String(uid));
      if (item && extra.shareKey) item.shareKey = String(extra.shareKey);
      const entry = ensureEntry(accountId, uid);
      entry.lastApplyAt = Date.now();
      entry.applyCount = (entry.applyCount || 0) + 1;
      entry.status = 'pending';
      if (extra.name) entry.name = String(extra.name);
      if (Number(extra.level) > 0) entry.level = Number(extra.level);
    },
    profiles: new Map(),
    updateItemProfile(uid, extra = {}) {
      const key = String(uid);
      if (!items.has(key)) return false;
      const profile = this.profiles.get(key) || {};
      if (extra.name) profile.name = String(extra.name);
      if (Number(extra.level) > 0) profile.level = Number(extra.level);
      if (extra.dogBreed) profile.dogBreed = String(extra.dogBreed);
      if (extra.dogFetchedAt) profile.dogFetchedAt = Number(extra.dogFetchedAt);
      if (extra.levelFetchedAt) profile.levelFetchedAt = Number(extra.levelFetchedAt);
      this.profiles.set(key, profile);
      return true;
    },
    markVisitClosed(uid) {
      const item = items.get(String(uid));
      if (!item) return false;
      item.visitClosed = true;
      item.visitClosedAt = Date.now();
      return true;
    },
    markVisitOpen(uid) {
      const item = items.get(String(uid));
      if (!item || !item.visitClosed) return false;
      delete item.visitClosed;
      delete item.visitClosedAt;
      return true;
    },
    markFriend(accountId, uid) {
      if (!items.has(String(uid))) return false;
      ensureEntry(accountId, uid).status = 'friend';
      return true;
    },
    markFriends(accountId, uids) {
      let count = 0;
      for (const uid of Array.isArray(uids) ? uids : []) {
        if (!items.has(String(uid))) continue;
        const entry = ensureEntry(accountId, uid);
        if (entry.status !== 'friend') {
          entry.status = 'friend';
          count++;
        }
      }
      return count;
    },
    peeks: [],
    peekStatus(accountId, uid) {
      this.peeks.push(String(uid));
      if (!items.has(String(uid))) return null;
      const entry = entriesFor(accountId).get(String(uid));
      return entry ? entry.status : 'new';
    },
    /** 批量流程用：一次给出该账号所有条目状态（线上实现同样只读一次号池文件） */
    getStatusMap(accountId) {
      const map = new Map();
      for (const uid of items.keys()) {
        const entry = entriesFor(accountId).get(uid);
        map.set(uid, entry ? entry.status : 'new');
      }
      return map;
    },
    /** 当日好友申请上限（线上按自然日判断，替身只关心「有没有记录」） */
    limits: new Map(),
    getDailyLimitState(accountId) {
      const rec = this.limits.get(String(accountId || 'default'));
      if (!rec) return { blocked: false, dateKey: '', at: null, error: '' };
      return { blocked: true, dateKey: rec.dateKey, at: rec.at, error: rec.error };
    },
    isDailyLimitBlocked(accountId) {
      return this.getDailyLimitState(accountId).blocked;
    },
    markDailyLimit(accountId, error) {
      this.limits.set(String(accountId || 'default'), {
        dateKey: '2026-11-22',
        at: Date.now(),
        error: String(error || ''),
      });
    },
  };
}

/**
 * 用假依赖加载 invite 服务，避免真实网络/文件读写。
 * levels: { [uid]: 农场等级 } —— VisitService.Enter 的回包等级
 * visitFailFor: Set<uid> —— 这些 uid 进农场时报错（模拟 share_key 过期）
 * friendGids: Array —— 已有好友 gid 列表（批量前比对，已是好友跳过）
 * friendListFails: boolean —— 模拟好友列表拉取失败
 * poolSeed: { [uid]: 'dead'|'pending'|'friend' } —— 号池预置状态
 * 返回 { applyInviteList, sent, pool, restore }
 */
function loadInviteService({ platform = 'wx', sendImpl, levels = {}, visitFailFor = new Set(), visitClosedFor = new Set(), friendGids = [], friendListFails = false, noTokenFor = new Set(), poolSeed = {}, visitSwitch = true, switchWritable = true } = {}) {
  const configPath = require.resolve('../src/config/config');
  const pathsPath = require.resolve('../src/config/runtime-paths');
  const networkPath = require.resolve('../src/utils/network');
  const protoPath = require.resolve('../src/utils/proto');
  const utilsPath = require.resolve('../src/utils/utils');
  const jsonDbPath = require.resolve('../src/services/json-db');
  const friendApiPath = require.resolve('../src/services/friend-api');
  const friendPoolPath = require.resolve('../src/services/friend-pool');
  const servicePath = require.resolve('../src/services/invite');

  const paths = [configPath, pathsPath, networkPath, protoPath, utilsPath, jsonDbPath, friendApiPath, friendPoolPath, servicePath];
  const previous = new Map(paths.map(path => [path, require.cache[path]]));
  const sent = [];
  const sleepCalls = [];
  const pool = createFakePool(poolSeed);
  // 「点击分享链接可拜访好友」开关：默认开启；关闭时 Enter 会返回 1002007
  let switchOn = visitSwitch === true;

  // 请求体直接用 JSON 传递，方便假网络层判断是哪个 uid
  const jsonEncode = value => ({ finish: () => Buffer.from(JSON.stringify(value || {})) });
  const jsonDecode = body => JSON.parse(Buffer.from(body || '').toString() || '{}');

  require.cache[configPath] = mockModule(configPath, { CONFIG: { platform } });
  require.cache[pathsPath] = mockModule(pathsPath, { getShareFilePath: () => 'share.txt' });
  require.cache[networkPath] = mockModule(networkPath, {
    sendMsgAsync: async (service, method, body) => {
      const index = sent.length;
      sent.push({ service, method });
      const err = sendImpl ? sendImpl(service, method, body, index) : null;
      if (err)
        throw err;
      // 用户设置：好友拜访开关（抓包实证 field6=1 为开启）
      if (service === 'gamepb.userpb.UserService') {
        if (method === 'GetUserSettings')
          return { body: Buffer.from(JSON.stringify({ visit_by_share_key: switchOn ? 1 : 0 })) };
        if (method === 'SetUserSettings') {
          const payload = jsonDecode(body);
          if (switchWritable && Number(payload.visit_by_share_key || 0) === 1)
            switchOn = true;
          return { body: Buffer.alloc(0) };
        }
        return { body: Buffer.alloc(0) };
      }
      if (service === 'gamepb.visitpb.VisitService') {
        const payload = jsonDecode(body);
        const gid = String(payload.host_gid);
        if (method === 'Enter') {
          if (!switchOn)
            throw new Error('gamepb.visitpb.VisitService.Enter 错误: code=1002007 未打开拜访好友开关');
          // 己方开关已开，但对方不让拜访：同样是 1002007，属于「拜访关闭」条目
          if (visitClosedFor.has(gid))
            throw new Error('gamepb.visitpb.VisitService.Enter 错误: code=1002007 未打开拜访好友开关');
          if (visitFailFor.has(gid))
            throw new Error('share_key 已失效');
          return {
            body: Buffer.from(JSON.stringify({
              gid,
              name: `玩家${gid}`,
              level: Number(levels[gid] || 0),
              ...(noTokenFor.has(gid) ? {} : { apply_token: `token-${gid}:${gid}` }),
            })),
          };
        }
        return { body: Buffer.alloc(0) };
      }
      return { body: Buffer.alloc(0) };
    },
  });
  require.cache[protoPath] = mockModule(protoPath, {
    types: {
      ReportArkClickRequest: {
        create: value => value,
        encode: () => ({ finish: () => Buffer.alloc(0) }),
      },
      ReportArkClickReply: { decode: () => ({}) },
      VisitEnterRequest: { create: value => value, encode: jsonEncode },
      VisitEnterReply: { decode: body => ({ basic: jsonDecode(body), apply_token: jsonDecode(body).apply_token || '' }) },
      VisitLeaveRequest: { create: value => value, encode: jsonEncode },
      ApplyFriendRequest: { create: value => value, encode: jsonEncode },
      ApplyFriendReply: { decode: () => ({}) },
      GetUserSettingsRequest: { create: value => value, encode: jsonEncode },
      GetUserSettingsReply: { decode: body => ({ settings: body && body.length ? jsonDecode(body) : {} }) },
      SetUserSettingsRequest: { create: value => value, encode: jsonEncode },
      SetUserSettingsReply: { decode: () => ({}) },
    },
  });
  require.cache[utilsPath] = mockModule(utilsPath, {
    toLong: value => value,
    log: () => {},
    logWarn: () => {},
    sleep: async (ms) => { sleepCalls.push(ms); },
  });
  require.cache[jsonDbPath] = mockModule(jsonDbPath, {
    readTextFile: () => '',
    writeTextFileAtomic: () => {},
  });
  require.cache[friendApiPath] = mockModule(friendApiPath, {
    getAllFriends: async () => {
      if (friendListFails)
        throw new Error('好友列表不可用');
      return { game_friends: friendGids.map(gid => ({ gid: String(gid) })) };
    },
  });
  require.cache[friendPoolPath] = mockModule(friendPoolPath, pool);
  delete require.cache[servicePath];

  const service = require(servicePath);

  return {
    applyInviteList: service.applyInviteList,
    fetchLevelsForItems: service.fetchLevelsForItems,
    sent,
    sleepCalls,
    pool,
    isSwitchOn: () => switchOn,
    restore() {
      for (const [path, cached] of previous) {
        if (cached)
          require.cache[path] = cached;
        else
          delete require.cache[path];
      }
    },
  };
}

test('applyInviteList 逐条发送并按原顺序返回结果', async (t) => {
  const ctx = loadInviteService();
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '101', openid: 'open-a', shareSource: '8', shareKey: 'k1' },
    { uid: '102', openid: 'open-b', shareSource: '9', shareKey: 'k2' },
    { uid: '103', openid: 'open-c', shareKey: 'k3' },
  ], { delayMs: 0 });

  assert.equal(result.total, 3);
  assert.equal(result.success, 3);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.results.map(item => item.uid), ['101', '102', '103']);
  assert.ok(result.results.every(item => item.ok === true));
  // 每条流程：Enter → Leave → ReportArkClick → ApplyFriend
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 3);
  assert.equal(ctx.sent.filter(item => item.method === 'Enter').length, 3);
});

test('applyInviteList 单条失败不影响后续，并返回失败原因', async (t) => {
  let applyCount = 0;
  const ctx = loadInviteService({
    sendImpl: (_service, method) => {
      if (method === 'ApplyFriend') {
        applyCount++;
        if (applyCount === 1)
          return new Error('操作太频繁');
      }
      return null;
    },
  });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '201', openid: 'open-a', shareKey: 'k1' },
    { uid: '202', openid: 'open-b', shareKey: 'k2' },
    { uid: '203', openid: 'open-c', shareKey: 'k3' },
  ], { delayMs: 0 });

  assert.equal(result.total, 3);
  assert.equal(result.success, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.results[0].ok, false);
  assert.match(result.results[0].error, /操作太频繁/);
  assert.equal(result.results[1].ok, true);
  assert.equal(result.results[2].ok, true);
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 3);
});

test('applyInviteList 缺少 uid/openid 的条目直接标失败且不发送', async (t) => {
  const ctx = loadInviteService();
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '301' },
    { openid: 'open-b' },
    { uid: '302', openid: 'open-c', shareKey: 'k3' },
  ], { delayMs: 0 });

  assert.equal(result.total, 3);
  assert.equal(result.success, 1);
  assert.equal(result.failed, 2);
  assert.match(result.results[0].error, /缺少 uid 或 openid/);
  assert.match(result.results[1].error, /缺少 uid 或 openid/);
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 1);
});

test('applyInviteList 在 QQ 环境直接报错，不发送任何请求', async (t) => {
  const ctx = loadInviteService({ platform: 'qq' });
  t.after(() => ctx.restore());

  await assert.rejects(
    () => ctx.applyInviteList([{ uid: '401', openid: 'open-a', shareKey: 'k1' }], { delayMs: 0 }),
    /仅微信账号支持/,
  );
  assert.equal(ctx.sent.length, 0);
});

test('applyInviteList 每条都先进对方农场拿申请令牌再发 ApplyFriend', async (t) => {
  const ctx = loadInviteService({ levels: { 101: 999 } });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([{ uid: '101', openid: 'open-a', shareKey: 'k1' }], { delayMs: 0 });

  assert.equal(result.success, 1);
  assert.equal(result.skipped, 0);
  const gameCalls = ctx.sent.filter(item => !['GetUserSettings', 'SetUserSettings'].includes(item.method));
  assert.equal(gameCalls.length, 4);
  assert.deepEqual(gameCalls.map(item => item.method), ['Enter', 'Leave', 'ReportArkClick', 'ApplyFriend']);
  assert.equal(gameCalls[3].service, 'gamepb.friendpb.FriendService');
});

test('applyInviteList minLevel 过滤：低于阈值的跳过且不发申请', async (t) => {
  const ctx = loadInviteService({ levels: { 101: 5, 102: 30, 103: 12 } });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '101', openid: 'open-a', shareKey: 'k1' },
    { uid: '102', openid: 'open-b', shareKey: 'k2' },
    { uid: '103', openid: 'open-c', shareKey: 'k3' },
  ], { delayMs: 0, minLevel: 10 });

  assert.equal(result.total, 3);
  assert.equal(result.success, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.minLevel, 10);

  const low = result.results[0];
  assert.equal(low.skipped, true);
  assert.equal(low.level, 5);
  assert.match(low.error, /农场等级 5 < 10/);

  assert.equal(result.results[1].level, 30);
  assert.equal(result.results[1].ok, true);
  assert.equal(result.results[2].level, 12);
  assert.equal(result.results[2].ok, true);
  // 低于阈值的不发 ReportArkClick/ApplyFriend，其余两条走完整流程
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 2);
  assert.equal(ctx.sent.filter(item => item.method === 'ReportArkClick').length, 2);
});

test('applyInviteList 缺少 share_key 的条目默认跳过且不查不发', async (t) => {
  const ctx = loadInviteService({ levels: { 201: 50 } });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '201', openid: 'open-a' },
  ], { delayMs: 0, minLevel: 10 });

  assert.equal(result.skipped, 1);
  assert.match(result.results[0].error, /缺少 share_key/);
  assert.equal(ctx.sent.filter(item => !['GetUserSettings', 'SetUserSettings'].includes(item.method)).length, 0);
});

test('applyInviteList 等级查询失败：默认跳过', async (t) => {
  const failing = loadInviteService({ visitFailFor: new Set(['301']) });
  t.after(() => failing.restore());

  const skipped = await failing.applyInviteList([
    { uid: '301', openid: 'open-a', shareKey: 'expired' },
  ], { delayMs: 0, minLevel: 10 });

  assert.equal(skipped.skipped, 1);
  assert.match(skipped.results[0].error, /等级查询失败/);
  assert.equal(failing.sent.filter(item => item.method === 'ApplyFriend').length, 0);
});

test('applyInviteList 等级查询失败且 allowUnknownLevel 时也无法申请（没有令牌）', async (t) => {
  // 抓包实证：ApplyFriend 必须携带 Enter 回包的 apply_token，
  // Enter 失败意味着拿不到令牌，allowUnknownLevel 也无法发送申请
  const lenient = loadInviteService({ visitFailFor: new Set(['301']) });
  t.after(() => lenient.restore());

  const added = await lenient.applyInviteList([
    { uid: '301', openid: 'open-a', shareKey: 'expired' },
  ], { delayMs: 0, minLevel: 10, allowUnknownLevel: true });

  assert.equal(added.success, 0);
  assert.equal(added.skipped, 0);
  assert.equal(added.failed, 1);
  assert.match(added.results[0].error, /进入对方农场失败/);
  assert.equal(lenient.sent.filter(item => item.method === 'ApplyFriend').length, 0);
});

test('applyInviteList 等级为 0（服务端没给）按未知处理', async (t) => {
  const ctx = loadInviteService({ levels: { 401: 0 } });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '401', openid: 'open-a', shareKey: 'k1' },
  ], { delayMs: 0, minLevel: 10 });

  assert.equal(result.skipped, 1);
  assert.match(result.results[0].error, /未能读取农场等级/);
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 0);
});

test('applyInviteList Enter 回包没有申请令牌时按失败处理', async (t) => {
  const ctx = loadInviteService({ noTokenFor: new Set(['501']) });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '501', openid: 'open-a', shareKey: 'k1' },
  ], { delayMs: 0 });

  assert.equal(result.success, 0);
  assert.equal(result.failed, 1);
  assert.match(result.results[0].error, /未返回好友申请令牌/);
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 0);
});

test('applyInviteList 已是好友的 uid 直接跳过，不发申请也不查等级', async (t) => {
  const ctx = loadInviteService({
    friendGids: ['1216412385', '501'],
    levels: { 501: 66, 502: 88 },
  });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '501', openid: 'open-a', shareKey: 'k1' },
    { uid: '502', openid: 'open-b', shareKey: 'k2' },
  ], { delayMs: 0, minLevel: 10 });

  assert.equal(result.total, 2);
  assert.equal(result.existing, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.success, 1);
  assert.equal(result.failed, 0);

  const friend = result.results[0];
  assert.equal(friend.existing, true);
  assert.equal(friend.skipped, true);
  assert.equal(friend.ok, false);
  assert.match(friend.error, /已是好友/);

  // 好友那条既不进农场查等级，也不发申请
  assert.equal(ctx.sent.filter(item => item.method === 'Enter').length, 1);
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 1);
  assert.equal(result.results[1].ok, true);
  assert.equal(result.results[1].level, 88);
});

test('applyInviteList 好友列表拉取失败时降级为不跳过', async (t) => {
  const ctx = loadInviteService({ friendListFails: true, levels: { 601: 50 } });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '601', openid: 'open-a', shareKey: 'k1' },
  ], { delayMs: 0 });

  assert.equal(result.success, 1);
  assert.equal(result.existing, 0);
  assert.equal(result.skipped, 0);
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 1);
});

test('applyInviteList 显式关闭 skipExistingFriends 时好友也照发', async (t) => {
  const ctx = loadInviteService({ friendGids: ['701'] });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '701', openid: 'open-a', shareKey: 'k1' },
  ], { delayMs: 0, skipExistingFriends: false });

  assert.equal(result.success, 1);
  assert.equal(result.existing, 0);
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 1);
});

test('applyInviteList 号池标记不可加（超 24h 未通过）的直接跳过', async (t) => {
  const ctx = loadInviteService({
    levels: { 801: 60, 802: 61 },
    poolSeed: { 801: 'dead' },
  });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '801', openid: 'open-a', shareKey: 'k1' },
    { uid: '802', openid: 'open-b', shareKey: 'k2' },
  ], { delayMs: 0 });

  assert.equal(result.poolSkipped, 1);
  assert.equal(result.results[0].poolSkipped, true);
  assert.equal(result.results[0].skipped, true);
  assert.match(result.results[0].error, /不可加/);

  // 不可加的那条不进农场、不发申请；只处理另一条
  assert.equal(ctx.sent.filter(item => item.method === 'Enter').length, 1);
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 1);
  assert.equal(result.results[1].ok, true);
});

test('applyInviteList 号池待通过（24h 内已申请）的不重复申请', async (t) => {
  const ctx = loadInviteService({ levels: { 811: 70 }, poolSeed: { 811: 'pending' } });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '811', openid: 'open-a', shareKey: 'k1' },
  ], { delayMs: 0 });

  assert.equal(result.success, 0);
  assert.equal(result.poolSkipped, 1);
  assert.match(result.results[0].error, /等待通过/);
  assert.equal(ctx.sent.filter(item => !['GetUserSettings', 'SetUserSettings'].includes(item.method)).length, 0);
  assert.equal(ctx.pool.entriesFor('default').get('811').applyCount, 1);
});

test('applyInviteList 申请成功后写回号池（pending + applyCount）', async (t) => {
  const ctx = loadInviteService({ levels: { 821: 42 } });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '821', openid: 'open-a', shareKey: 'k1' },
  ], { delayMs: 0, minLevel: 10 });

  assert.equal(result.success, 1);
  const entry = ctx.pool.entriesFor('default').get('821');
  assert.equal(entry.status, 'pending');
  assert.equal(entry.applyCount, 1);
  assert.ok(entry.lastApplyAt > 0);
  assert.equal(entry.level, 42);
});

test('applyInviteList 触发每日上限（1005027）后立即停止整批', async (t) => {
  const ctx = loadInviteService({
    levels: { 831: 50, 832: 50, 833: 50 },
    sendImpl: (_service, method) => {
      if (method === 'ApplyFriend')
        return new Error('code=1005027 今日发出的好友申请已达上限');
      return null;
    },
  });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '831', openid: 'open-a', shareKey: 'k1' },
    { uid: '832', openid: 'open-b', shareKey: 'k2' },
    { uid: '833', openid: 'open-c', shareKey: 'k3' },
  ], { delayMs: 0 });

  assert.equal(result.limitReached, true);
  assert.equal(result.success, 0);
  assert.equal(result.results.length, 3);

  // 只对第一条真正发过申请，后面两条连 Enter 都不做
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 1);
  assert.equal(ctx.sent.filter(item => item.method === 'Enter').length, 1);
  // 上限触发后，剩余条目被打上 limitReached 标记，明天还能复用同一批链接
  assert.equal(result.results[1].limitReached, true);
  assert.equal(result.results[2].limitReached, true);
  assert.match(result.results[1].error, /已达上限/);
});

test('applyInviteList 上限触发时不把该条记成已申请（号池保持 new）', async (t) => {
  const ctx = loadInviteService({
    levels: { 841: 50 },
    sendImpl: (_service, method) => (method === 'ApplyFriend'
      ? new Error('今日好友申请已达上限')
      : null),
  });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '841', openid: 'open-a', shareKey: 'k1' },
  ], { delayMs: 0 });

  assert.equal(result.limitReached, true);
  const entry = ctx.pool.entriesFor('default').get('841');
  assert.equal(entry.status, 'new');
  assert.equal(entry.applyCount, 0);
});

test('applyInviteList 撞上限后把「今日已上限」记到号池，同一天后续批次零请求', async (t) => {
  const ctx = loadInviteService({
    levels: { 851: 50 },
    sendImpl: (_service, method) => (method === 'ApplyFriend'
      ? new Error('code=1005027 今日发出的好友申请已达上限')
      : null),
  });
  t.after(() => ctx.restore());

  await ctx.applyInviteList([{ uid: '851', openid: 'open-a', shareKey: 'k1' }], { delayMs: 0 });
  assert.equal(ctx.pool.getDailyLimitState('default').blocked, true);

  // 第二批（用户又点了一次按钮 / 定时任务）：当天已记录上限，整批跳过且零请求
  ctx.sent.length = 0;
  ctx.sleepCalls.length = 0;
  const second = await ctx.applyInviteList([
    { uid: '852', openid: 'open-b', shareKey: 'k2' },
    { uid: '853', openid: 'open-c', shareKey: 'k3' },
  ], { delayMs: 2000 });

  assert.equal(second.limitReached, true);
  assert.equal(second.success, 0);
  assert.equal(second.skipped, 2);
  assert.equal(ctx.sent.length, 0);
  assert.equal(ctx.sleepCalls.length, 0);
  assert.ok(second.results.every(row => row.limitReached === true));
});

test('applyInviteList 用好友列表回填号池：已通过的人不会被误判成不可加', async (t) => {
  const ctx = loadInviteService({
    friendGids: ['861'],
    levels: { 861: 30, 862: 30 },
    poolSeed: { 861: 'pending', 862: 'pending' },
  });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '861', openid: 'open-a', shareKey: 'k1' },
    { uid: '862', openid: 'open-b', shareKey: 'k2' },
  ], { delayMs: 0 });

  // 861 已是好友：跳过 + 号池改成 friend
  assert.equal(result.existing, 1);
  assert.equal(ctx.pool.entriesFor('default').get('861').status, 'friend');
  // 862 仍在等待通过，不重复申请
  assert.equal(ctx.pool.entriesFor('default').get('862').status, 'pending');
  assert.equal(result.poolSkipped, 1);
  assert.equal(ctx.sent.filter(item => !['GetUserSettings', 'SetUserSettings'].includes(item.method)).length, 0);
});

test('仅对真正发申请的动作限速：已是好友 / 已申请 / 不可加 不占用等待间隔', async (t) => {
  const ctx = loadInviteService({
    friendGids: ['701'],
    levels: { 704: 30 },
    poolSeed: { 701: 'new', 702: 'pending', 703: 'dead' },
  });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '701', openid: 'open-a', shareKey: 'k1' }, // 已是好友
    { uid: '702', openid: 'open-b', shareKey: 'k2' }, // 24h 内已申请
    { uid: '703', openid: 'open-c', shareKey: 'k3' }, // 号池不可加
    { uid: '704', openid: 'open-d', shareKey: 'k4' }, // 唯一真正发申请（最后一条）
  ], { delayMs: 2000 });

  assert.equal(result.success, 1);
  assert.equal(result.existing, 1);
  assert.equal(result.poolSkipped, 2);
  // 最后一条不需要等待，前面三条都没发请求 → 一次都不该 sleep
  assert.equal(ctx.sleepCalls.length, 0);
  // 走的是号池状态快照（一次读取），不是逐条 peekStatus
  assert.equal(ctx.pool.peeks.length, 0);
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 1);
});

test('只有真实申请之间才插入间隔（N 条申请 = N-1 次等待）', async (t) => {
  const ctx = loadInviteService({ levels: { 801: 30, 802: 30, 803: 30 } });
  t.after(() => ctx.restore());

  await ctx.applyInviteList([
    { uid: '801', openid: 'open-a', shareKey: 'k1' },
    { uid: '802', openid: 'open-b', shareKey: 'k2' },
    { uid: '803', openid: 'open-c', shareKey: 'k3' },
  ], { delayMs: 1500 });

  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 3);
  assert.equal(ctx.sleepCalls.length, 2);
  assert.ok(ctx.sleepCalls.every(ms => ms === 1500));
});

test('拜访好友开关没开时自动打开，并继续加好友', async (t) => {
  // 抓包实证 2026-11-22：开关关闭 → Enter 返回 1002007 → 拿不到 apply_token。
  // SetUserSettings{field6=1} 就是游戏里点开该开关的请求。
  const ctx = loadInviteService({ visitSwitch: false, levels: { 901: 40, 902: 41 } });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '901', openid: 'open-a', shareKey: 'k1' },
    { uid: '902', openid: 'open-b', shareKey: 'k2' },
  ], { delayMs: 0 });

  assert.equal(result.switchBlocked, false);
  assert.equal(result.success, 2);
  assert.equal(ctx.isSwitchOn(), true);
  assert.equal(ctx.sent.filter(item => item.method === 'SetUserSettings').length, 1);
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 2);
});

test('自动打开开关失败时整批立即停止，不再逐条撞 1002007', async (t) => {
  const ctx = loadInviteService({ visitSwitch: false, switchWritable: false, levels: { 911: 40 } });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '911', openid: 'open-a', shareKey: 'k1' },
    { uid: '912', openid: 'open-b', shareKey: 'k2' },
  ], { delayMs: 0 });

  assert.equal(result.switchBlocked, true);
  assert.equal(result.success, 0);
  assert.equal(result.results.length, 2);
  assert.ok(result.results.every(item => item.switchBlocked === true));
  assert.match(result.results[0].error, /拜访好友/);
  // 一条 Enter 都没发，也没发申请
  assert.equal(ctx.sent.filter(item => item.method === 'Enter').length, 0);
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 0);
});

test('对方拜访关闭（1002007）：标记 visitClosed，不重试、不停整批', async (t) => {
  const ctx = loadInviteService({
    levels: { 921: 50, 922: 55 },
    visitClosedFor: new Set(['921']),
  });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '921', openid: 'open-a', shareKey: 'k1' },
    { uid: '922', openid: 'open-b', shareKey: 'k2' },
  ], { delayMs: 0 });

  // 921：拜访关闭，不发起申请，也不触发整批 switchBlocked
  assert.equal(result.switchBlocked, false);
  assert.equal(result.visitClosed, 1);
  assert.equal(result.success, 1);
  assert.equal(result.results[0].visitClosed, true);
  assert.match(result.results[0].error, /拜访关闭/);
  // 922 照常加成功；921 没有 ApplyFriend
  assert.equal(result.results[1].ok, true);
  assert.equal(ctx.sent.filter(item => item.method === 'ApplyFriend').length, 1);
  // 号池记录拜访关闭
  assert.equal(ctx.pool.items.get('921').visitClosed, true);
});

test('申请成功后顺手把昵称/等级/识别时间写回号池（自动识别）', async (t) => {
  const ctx = loadInviteService({ levels: { 101: 66 } });
  t.after(() => ctx.restore());

  const result = await ctx.applyInviteList([
    { uid: '101', openid: 'open-a', shareSource: '8', shareKey: 'k1' },
  ], { delayMs: 0 });

  assert.equal(result.success, 1);
  const profile = ctx.pool.profiles.get('101');
  assert.ok(profile, '应当写回号池资料');
  assert.equal(profile.level, 66);
  assert.ok(profile.dogFetchedAt > 0, '识别时间要记下来，避免被当成「无狗」');
});

test('读取等级时发现对方拜访关闭：不需要先加好友', async (t) => {
  const ctx = loadInviteService({ visitClosedFor: new Set(['921']) });
  t.after(() => ctx.restore());
  ctx.pool.upsertInviteItems([{ uid: '921', openid: 'open-921', shareKey: 'k921' }]);

  const result = await ctx.fetchLevelsForItems([{ uid: '921', shareKey: 'k921' }], { delayMs: 0 });

  assert.equal(result.visitClosed, 1);
  assert.equal(result.ok, 0);
  assert.equal(result.results[0].visitClosed, true);
  assert.equal(ctx.pool.items.get('921').visitClosed, true);
});

test('读取等级时 Enter 成功会清掉过期的「拜访关闭」', async (t) => {
  const ctx = loadInviteService();
  t.after(() => ctx.restore());
  ctx.pool.upsertInviteItems([{ uid: '923', openid: 'open-923', shareKey: 'k923' }]);
  ctx.pool.markVisitClosed('923', '旧的 1002007');

  const result = await ctx.fetchLevelsForItems([{ uid: '923', shareKey: 'k923' }], { delayMs: 0 });

  assert.equal(result.ok, 1);
  assert.equal(ctx.pool.items.get('923').visitClosed, undefined);
});
