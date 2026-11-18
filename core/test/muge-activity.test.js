const test = require('node:test');
const assert = require('node:assert/strict');

// 牧歌初启的纯逻辑校验：不触网，只验证协议字段映射、清空/保存分开发送、
// 以及回包不匹配时不谎报成功这几条最容易被写错的地方。
const MUGE_PATH = require.resolve('../src/services/muge-activity');
const proto = require('../src/utils/proto');
const network = require('../src/utils/network');

const GROUP_ID = '2026111700';

function encodeGroup({ status = 1, start = 1, end = 4102444800, children = [] } = {}) {
  const groups = [{
    head: { id: GROUP_ID, group_id: GROUP_ID, name: '牧歌初启', status, start_time: start, end_time: end },
    children,
  }];
  return Buffer.from(proto.types.MugeListReply.encode({ groups }).finish());
}

// 因为服务在模块加载时就解构了 sendMsgAsync，必须在 require 之前替换。
async function withService({ listReply, operateReply }, run) {
  await proto.loadProto();
  const originalSend = network.sendMsgAsync;
  const sent = [];
  network.sendMsgAsync = async (service, method, body) => {
    sent.push(method);
    if (method === 'List') return { body: listReply ? listReply() : Buffer.alloc(0) };
    return { body: operateReply ? operateReply() : Buffer.alloc(0) };
  };
  delete require.cache[MUGE_PATH];
  const service = require(MUGE_PATH);
  try {
    await run(service, sent);
  } finally {
    network.sendMsgAsync = originalSend;
    delete require.cache[MUGE_PATH];
  }
}

test('muge operations map to the documented cmd and payload field', async () => {
  await withService({}, async (service) => {
    const ops = service.MUGE_OPERATIONS;
    assert.equal(service.MUGE_GROUP_ID, GROUP_ID);
    assert.equal(ops.claimCelebration.cmd, 85);
    assert.equal(ops.claimCelebration.field, 'global_count_claim_tier');
    assert.equal(ops.claimFriends.cmd, 84);
    assert.equal(ops.claimTask.cmd, 82);
    assert.equal(ops.claimHandbook.cmd, 83);
    assert.equal(ops.saveAnswers.cmd, 86);
    assert.equal(ops.settle.cmd, 87);
    assert.equal(ops.claimShare.cmd, 89);
    assert.equal(ops.saveAnswers.field, 'survey_save_progress');
  });
});

test('muge refuses to save answers and clear progress in the same request', async () => {
  // 需要一个带上人格分区的快照，才能走到参数校验那一层。
  const listReply = () => encodeGroup({ children: [{ head: { id: '2026111705' }, survey: {} }] });
  await withService({ listReply }, async (service, sent) => {
    await assert.rejects(
      () => service.operateMugeActivity('saveAnswers', { answers: { 1: 1 }, clear: true }),
      /分开提交/,
    );
    // 读一次快照是必要的，但参数不合法时绝不能发出 Operate。
    assert.deepEqual(sent.filter(method => method !== 'List'), [], '参数校验失败时不应该提交写请求');
  });
});

test('muge reports an unconfirmed reply instead of claiming success', async () => {
  await withService({
    listReply: () => encodeGroup({
      children: [{
        head: { id: '2026111702' },
        global_count: { total: 0, tiers: [{ tier_id: 1, threshold: 10, status: 2 }] },
      }],
    }),
    // 回包 id 故意错开，模拟错配
    operateReply: () => Buffer.from(proto.types.MugeOperateReply.encode({ id: '1999999999', cmd: 85 }).finish()),
  }, async (service) => {
    await assert.rejects(
      () => service.operateMugeActivity('claimCelebration', {}),
      /未确认|勿重复提交/,
    );
  });
});

test('muge surfaces an ended activity instead of writing', async () => {
  await withService({
    listReply: () => encodeGroup({ status: 2, start: 1, end: 2 }),
  }, async (service) => {
    await assert.rejects(
      () => service.operateMugeActivity('claimCelebration', {}),
      /尚未开始|已经结束/,
    );
  });
});

test('winter solar terms carry the upstream descriptions', () => {
  const terms = require('../src/gameConfig/SolarTerms.json').terms;
  const byId = new Map(terms.map(term => [term.id, term]));
  for (const id of [403, 404, 405]) {
    const term = byId.get(id);
    assert.ok(term, `missing solar term ${id}`);
    assert.equal(typeof term.description, 'string');
    assert.ok(term.description.length > 0, `solar term ${id} has no description`);
  }
  assert.match(byId.get(404).description, /小雪|雪/);
  assert.equal(terms.length, 16);
});
