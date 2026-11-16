const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 必须在 require store 之前隔离数据目录，否则会读到真实账号数据
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqfarm-harvest-'));
process.env.FARM_DATA_DIR = dataDir;
process.env.QQFARM_FRIEND_OPENIDS_FILE = path.join(dataDir, 'friend-openids.json');

const protoUtil = require('../src/utils/proto');
const { CONFIG } = require('../src/config/config');

/**
 * friend-api 在加载时就把 `sendMsgAsync` 解构走了，所以必须先把网络模块换成假货，
 * 再清掉 friend-api / career 的缓存重新 require，才能拦到真实调用。
 */
function withFakeNetwork(replyBuilder) {
  const networkPath = require.resolve('../src/utils/network');
  const apiPath = require.resolve('../src/services/friend-api');
  const careerPath = require.resolve('../src/services/career');
  const savedNetwork = require.cache[networkPath];
  const savedApi = require.cache[apiPath];
  const savedCareer = require.cache[careerPath];
  const calls = [];

  require.cache[networkPath] = {
    id: networkPath,
    filename: networkPath,
    loaded: true,
    exports: {
      connect: async () => {},
      reconnect: async () => {},
      cleanup: () => {},
      stopNetwork: () => {},
      getWs: () => null,
      isConnected: () => true,
      sendMsg: async () => ({}),
      sendMsgAsync: async (service, method, body) => {
        calls.push({ service, method, size: body ? body.length : 0 });
        return { body: replyBuilder(method, body, service) };
      },
      waitForGatewayIdle: async () => true,
      isGatewayIdleForLowPriority: () => true,
      isGatewayHealthyForBusiness: () => true,
      getUserState: () => ({ gid: 9999 }),
      networkEvents: { on: () => {}, off: () => {}, once: () => {}, emit: () => {} },
    },
  };
  delete require.cache[apiPath];
  delete require.cache[careerPath];

  const api = require('../src/services/friend-api');
  return {
    api,
    calls,
    restore() {
      delete require.cache[apiPath];
      delete require.cache[careerPath];
      if (savedApi) require.cache[apiPath] = savedApi;
      if (savedCareer) require.cache[careerPath] = savedCareer;
      if (savedNetwork) require.cache[networkPath] = savedNetwork;
      else delete require.cache[networkPath];
    },
  };
}

function hexId(char) {
  return char.repeat(32).toUpperCase();
}

test('用 GID 换 open_id，再用 SyncAll 把好友拉回来', async () => {
  await protoUtil.loadProto();
  const types = protoUtil.types;
  const CareerReply = types.CareerInfoGetReply;
  const SyncReq = types.SyncAllRequest || types.SyncAllFriendsRequest;
  const SyncReply = types.SyncAllReply || types.SyncAllFriendsReply;

  const openIdMap = new Map([
    [1001, hexId('A')],
    [1002, hexId('B')],
  ]);

  const originalPlatform = CONFIG.platform;
  CONFIG.platform = 'qq';

  const { api, calls, restore } = withFakeNetwork((method, body) => {
    if (method === 'CareerInfoGet') {
      const gid = Number(types.CareerInfoGetRequest.decode(body).gid);
      const openId = openIdMap.get(gid);
      if (!openId) throw new Error(`未知 GID ${gid}`);
      return CareerReply.encode(CareerReply.create({ gid, open_id: openId, name: `玩家${gid}`, level: 30 })).finish();
    }
    if (method === 'SyncAll') {
      const ids = SyncReq.decode(body).open_ids || [];
      const friends = ids.map((openId, index) => ({
        gid: 1001 + index,
        open_id: String(openId).toUpperCase(),
        name: `玩家${1001 + index}`,
      }));
      return SyncReply.encode(SyncReply.create({ game_friends: friends })).finish();
    }
    throw new Error(`未预期的 RPC ${method}`);
  });

  try {
    const result = await api.harvestFriendOpenIds({
      gids: [1001, 1002],
      remember: false,
      maxRounds: 1,
      concurrency: 2,
    });

    assert.equal(result.skipped, false);
    assert.equal(result.scannedGids, 2);
    assert.equal(result.openIds, 2);
    assert.equal(result.returnedFriends, 2);

    const methods = calls.map(call => call.method);
    assert.equal(methods.filter(name => name === 'CareerInfoGet').length, 2, '两个 GID 各查一次生涯信息');
    assert.equal(methods.filter(name => name === 'SyncAll').length, 1, '一轮 SyncAll');
    assert.ok(methods.indexOf('CareerInfoGet') < methods.indexOf('SyncAll'), '先换 open_id 再同步好友');
  } finally {
    restore();
    CONFIG.platform = originalPlatform;
  }
});

test('单个好友查生涯信息失败不会中断整轮', async () => {
  await protoUtil.loadProto();
  const types = protoUtil.types;
  const CareerReply = types.CareerInfoGetReply;
  const SyncReply = types.SyncAllReply || types.SyncAllFriendsReply;

  const originalPlatform = CONFIG.platform;
  CONFIG.platform = 'qq';

  const { api, restore } = withFakeNetwork((method, body) => {
    if (method === 'CareerInfoGet') {
      const gid = Number(types.CareerInfoGetRequest.decode(body).gid);
      if (gid === 2002) throw new Error('该玩家不存在');
      return CareerReply.encode(CareerReply.create({ gid, open_id: hexId('C') })).finish();
    }
    return SyncReply.encode(SyncReply.create({})).finish();
  });

  try {
    const result = await api.harvestFriendOpenIds({ gids: [2001, 2002], remember: false, maxRounds: 1, concurrency: 1 });
    assert.equal(result.scannedGids, 1, '只有成功的那次计入扫描数');
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /2002/);
  } finally {
    restore();
    CONFIG.platform = originalPlatform;
  }
});

test('非 QQ 平台默认跳过', async () => {
  const originalPlatform = CONFIG.platform;
  CONFIG.platform = 'wx';
  try {
    const { api, restore } = withFakeNetwork(() => Buffer.alloc(0));
    try {
      const result = await api.harvestFriendOpenIds({ gids: [1] });
      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'not_qq');
    } finally {
      restore();
    }
  } finally {
    CONFIG.platform = originalPlatform;
  }
});

test('SyncAll 回包里顺带下发的推荐好友也会被吃进来', async () => {
  await protoUtil.loadProto();
  const types = protoUtil.types;
  const CareerReply = types.CareerInfoGetReply;
  const SyncReq = types.SyncAllRequest || types.SyncAllFriendsRequest;
  const SyncReply = types.SyncAllReply || types.SyncAllFriendsReply;

  const originalPlatform = CONFIG.platform;
  CONFIG.platform = 'qq';

  const { api, restore } = withFakeNetwork((method, body) => {
    if (method === 'CareerInfoGet') {
      const gid = Number(types.CareerInfoGetRequest.decode(body).gid);
      return CareerReply.encode(CareerReply.create({ gid, open_id: hexId('D') })).finish();
    }
    // 请求里只有 1 个 open_id，回包却多带两个推荐好友
    const ids = SyncReq.decode(body).open_ids || [];
    const friends = ids.map(openId => ({ gid: 4001, open_id: String(openId).toUpperCase(), name: '好友' }));
    const recommended = [
      { gid: 5001, open_id: hexId('E'), name: '推荐甲', level: 42 },
      { gid: 5002, open_id: hexId('F'), name: '推荐乙', level: 43 },
    ];
    return SyncReply.encode(SyncReply.create({ game_friends: friends, recommended_friends: recommended })).finish();
  });

  try {
    const result = await api.harvestFriendOpenIds({ gids: [4001], remember: false, maxRounds: 1, concurrency: 1 });
    assert.equal(result.skipped, false);
    assert.equal(result.recommendedFriends, 2, '两个推荐好友被计入');
    assert.equal(result.returnedFriends, 3, '自己 1 个 + 推荐 2 个都算拉回');
  } finally {
    restore();
    CONFIG.platform = originalPlatform;
  }
});
