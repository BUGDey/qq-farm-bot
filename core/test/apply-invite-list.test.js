const test = require('node:test');
const assert = require('node:assert/strict');

function mockModule(filename, exports) {
  return { id: filename, filename, loaded: true, exports };
}

/**
 * 用假依赖加载 invite 服务，避免真实网络/文件读写。
 * levels: { [uid]: 农场等级 } —— VisitService.Enter 的回包等级
 * visitFailFor: Set<uid> —— 这些 uid 进农场时报错（模拟 share_key 过期）
 * friendGids: Array —— 已有好友 gid 列表（批量前比对，已是好友跳过）
 * friendListFails: boolean —— 模拟好友列表拉取失败
 * 返回 { applyInviteList, sent, restore }
 */
function loadInviteService({ platform = 'wx', sendImpl, levels = {}, visitFailFor = new Set(), friendGids = [], friendListFails = false, noTokenFor = new Set() } = {}) {
  const configPath = require.resolve('../src/config/config');
  const pathsPath = require.resolve('../src/config/runtime-paths');
  const networkPath = require.resolve('../src/utils/network');
  const protoPath = require.resolve('../src/utils/proto');
  const utilsPath = require.resolve('../src/utils/utils');
  const jsonDbPath = require.resolve('../src/services/json-db');
  const friendApiPath = require.resolve('../src/services/friend-api');
  const servicePath = require.resolve('../src/services/invite');

  const paths = [configPath, pathsPath, networkPath, protoPath, utilsPath, jsonDbPath, friendApiPath, servicePath];
  const previous = new Map(paths.map(path => [path, require.cache[path]]));
  const sent = [];

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
      if (service === 'gamepb.visitpb.VisitService') {
        const payload = jsonDecode(body);
        const gid = String(payload.host_gid);
        if (method === 'Enter') {
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
    },
  });
  require.cache[utilsPath] = mockModule(utilsPath, {
    toLong: value => value,
    log: () => {},
    logWarn: () => {},
    sleep: async () => {},
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
  delete require.cache[servicePath];

  const service = require(servicePath);

  return {
    applyInviteList: service.applyInviteList,
    sent,
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
  assert.equal(ctx.sent.length, 4);
  assert.deepEqual(ctx.sent.map(item => item.method), ['Enter', 'Leave', 'ReportArkClick', 'ApplyFriend']);
  assert.equal(ctx.sent[3].service, 'gamepb.friendpb.FriendService');
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
  assert.equal(ctx.sent.length, 0);
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
