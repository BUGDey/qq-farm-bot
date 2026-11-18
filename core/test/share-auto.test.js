const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const proto = require('../src/utils/proto');
const network = require('../src/utils/network');

const SHARE_PATH = require.resolve('../src/services/share');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'share-auto-'));
const originalDataDir = process.env.FARM_DATA_DIR;

process.env.FARM_DATA_DIR = DATA_DIR;

let originalDecode = null;
let share = null;

function clearState() {
  const file = path.join(DATA_DIR, 'share-claim-daily.json');
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}

function encodeReply(typeName, payload) {
  const type = proto.types[typeName];
  return type.encode(type.create(payload)).finish();
}

function makeClaimableStub(calls, { withNotify = false, claimError = null } = {}) {
  return async (service, method) => {
    calls.push({ service, method });
    if (method === 'ReportShare' || method === 'ReportArkClick') {
      throw new Error('FORGED_SHARE_FORBIDDEN');
    }
    if (method === 'CheckCanShare') {
      return { body: encodeReply('CheckCanShareReply', { can_share: true }) };
    }
    if (method === 'ClaimShareReward') {
      if (claimError) throw claimError;
      if (withNotify) {
        // 服务端在 ClaimShareReward 之后推送 ItemNotify(80021, delta=5)，走真实 handleNotify 解码路径
        const notifyBody = encodeReply('ItemNotify', {
          items: [{ item: { id: '80021', count: '37', is_new: true }, delta: '5' }],
        });
        const eventBody = encodeReply('EventMessage', {
          message_type: 'gamepb.itempb.ItemNotify',
          body: notifyBody,
        });
        const gateBody = encodeReply('GateMessage', {
          meta: { message_type: 3 },
          body: eventBody,
        });
        network.handleMessage(gateBody);
      }
      // 故意不设置 success：该字段受 wire2 嵌套影响不可靠，不得作为判据
      return { body: encodeReply('ClaimShareRewardReply', { has_reward: true }) };
    }
    throw new Error(`unexpected method: ${method}`);
  };
}

async function setup(stub) {
  // 强制顺序：先加载真实 proto，再替换 sendMsgAsync，再清缓存，最后 require share.js
  await proto.loadProto();
  if (typeof proto.types.ItemNotify.setup === 'function') proto.types.ItemNotify.setup();
  if (!originalDecode) originalDecode = proto.types.ItemNotify.decode;
  network.sendMsgAsync = stub;
  delete require.cache[SHARE_PATH];
  share = require(SHARE_PATH);
  return share;
}

function teardown() {
  if (originalDecode) proto.types.ItemNotify.decode = originalDecode;
  delete require.cache[SHARE_PATH];
  share = null;
}

test('可领取时：仅 CheckCanShare→ClaimShareReward，并用 ItemNotify(80021, delta=5) 确认到账', async () => {
  clearState();
  const calls = [];
  const originalRole = process.env.FARM_NETWORK_ROLE;
  process.env.FARM_NETWORK_ROLE = '';
  try {
    const svc = await setup(makeClaimableStub(calls, { withNotify: true }));
    const ok = await svc.claimDailyShareRewardIfAvailable({ share_claim_daily: true });
    assert.equal(ok, true);
    assert.deepEqual(calls.map(c => c.method), ['CheckCanShare', 'ClaimShareReward']);
    assert.equal(svc.getShareDailyState().claimDoneToday, true);

    // 已持久化：再次调用不再发包（重启后也从文件恢复）
    const before = calls.length;
    assert.equal(await svc.claimDailyShareRewardIfAvailable(), false);
    assert.equal(calls.length, before);
    const saved = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'share-claim-daily.json'), 'utf8'));
    assert.ok(saved.default, '今日完成日期应写入 json-db');
  } finally {
    if (originalRole === undefined) delete process.env.FARM_NETWORK_ROLE;
    else process.env.FARM_NETWORK_ROLE = originalRole;
    teardown();
  }
});

test('已领取（code=1009001）：视为今日完成并持久化，不重复领取', async () => {
  clearState();
  const calls = [];
  const err = new Error('gamepb.sharepb.ShareService.ClaimShareReward 错误: code=1009001 今日已领取');
  try {
    const svc = await setup(makeClaimableStub(calls, { claimError: err }));
    assert.equal(await svc.claimDailyShareRewardIfAvailable(), false);
    assert.deepEqual(calls.map(c => c.method), ['CheckCanShare', 'ClaimShareReward']);
    assert.equal(svc.getShareDailyState().claimDoneToday, true);

    const before = calls.length;
    assert.equal(await svc.claimDailyShareRewardIfAvailable(), false);
    assert.equal(calls.length, before, '已领取后不得再次提交领取');
  } finally {
    teardown();
  }
});

test('开关关闭：不发出任何 RPC', async () => {
  clearState();
  const calls = [];
  try {
    const svc = await setup(makeClaimableStub(calls, { withNotify: true }));
    assert.equal(await svc.claimDailyShareRewardIfAvailable({ share_claim_daily: false }), false);
    assert.equal(calls.length, 0);
    assert.equal(svc.getShareDailyState().claimDoneToday, false);
  } finally {
    teardown();
  }
});

test('回包不明（无 ItemNotify）：只提交一次、不标记完成、不重试', async () => {
  clearState();
  const calls = [];
  try {
    const svc = await setup(makeClaimableStub(calls, { withNotify: false }));
    assert.equal(await svc.claimDailyShareRewardIfAvailable(), false);
    assert.equal(calls.filter(c => c.method === 'ClaimShareReward').length, 1);
    assert.equal(svc.getShareDailyState().claimDoneToday, false);
    assert.ok(!fs.existsSync(path.join(DATA_DIR, 'share-claim-daily.json')), '不明回包不应落盘为已完成');
  } finally {
    teardown();
  }
});

test.after(() => {
  if (originalDecode) proto.types.ItemNotify.decode = originalDecode;
  if (originalDataDir === undefined) delete process.env.FARM_DATA_DIR;
  else process.env.FARM_DATA_DIR = originalDataDir;
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch { }
});
