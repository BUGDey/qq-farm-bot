const test = require('node:test');
const assert = require('node:assert/strict');

const protoUtil = require('../src/utils/proto');

/**
 * friend-api 在加载时就把 `sendMsgAsync` 解构走了，所以必须先把网络模块换成假货，
 * 再清掉 friend-api 的缓存重新 require，才能拦到真实调用。
 */
function withFakeNetwork(replyBuilder) {
  const networkPath = require.resolve('../src/utils/network');
  const apiPath = require.resolve('../src/services/friend-api');
  const savedNetwork = require.cache[networkPath];
  const savedApi = require.cache[apiPath];
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
        return { body: replyBuilder(method, body) };
      },
      waitForGatewayIdle: async () => true,
      isGatewayIdleForLowPriority: () => true,
      isGatewayHealthyForBusiness: () => true,
    },
  };
  delete require.cache[apiPath];

  const api = require('../src/services/friend-api');
  return {
    api,
    calls,
    restore() {
      delete require.cache[apiPath];
      if (savedApi) require.cache[apiPath] = savedApi;
      if (savedNetwork) require.cache[networkPath] = savedNetwork;
      else delete require.cache[networkPath];
    },
  };
}

test('用 open_id 列表调 SyncAll 换回 gid 映射', async () => {
  await protoUtil.loadProto();
  const types = protoUtil.types;
  const Rep = types.SyncAllReply || types.SyncAllFriendsReply;

  const { api, calls, restore } = withFakeNetwork(() => {
    const body = Rep.encode(
      Rep.create({
        game_friends: [
          { gid: 1001, open_id: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', name: '甲' },
          { gid: 1002, open_id: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', name: '乙' },
        ],
      })
    ).finish();
    return body;
  });

  try {
    const result = await api.syncFriendsFromOpenIds(
      ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
      { remember: false }
    );
    assert.equal(result.requested, 2, '重复的 open_id 要去重，小写要归一成大写');
    assert.equal(result.returned, 2);
    assert.deepEqual(
      result.matched.map((friend) => [friend.gid, friend.name]),
      [
        [1001, '甲'],
        [1002, '乙'],
      ]
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'SyncAll');
    assert.equal(calls[0].service, 'gamepb.friendpb.FriendService');
  } finally {
    restore();
  }
});

test('超过一批的 open_id 会分批发送', async () => {
  await protoUtil.loadProto();
  const types = protoUtil.types;
  const Rep = types.SyncAllReply || types.SyncAllFriendsReply;

  const { api, calls, restore } = withFakeNetwork(() => Rep.encode(Rep.create({})).finish());
  const ids = Array.from({ length: 5 }, (_, index) =>
    String(index + 1)
      .padStart(32, '0')
      .toUpperCase()
  );

  try {
    const result = await api.syncFriendsFromOpenIds(ids, { batchSize: 2, remember: false });
    assert.equal(result.requested, 5);
    assert.equal(calls.length, 3, '5 个 open_id、每批 2 个 → 3 次请求');
    assert.equal(result.batches, 3);
  } finally {
    restore();
  }
});

test('非法 open_id 会被整体拒绝', async () => {
  await protoUtil.loadProto();
  const { api, restore } = withFakeNetwork(() => Buffer.alloc(0));
  try {
    await assert.rejects(() => api.syncFriendsFromOpenIds(['not-an-openid'], { remember: false }), /open_id/);
  } finally {
    restore();
  }
});