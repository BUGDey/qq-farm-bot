const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const protobuf = require('protobufjs');
const crypto = require('node:crypto');

const PROTO = path.join(__dirname, '../src/proto/animalpb.proto');

async function loadRoot() {
  const root = new protobuf.Root();
  await root.load([PROTO], { keepCase: true });
  return root;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');
}

// 以下 hex/sha256 向量全部来自 Reqable HAR 经 TSDK 解密后的真实请求体；
// 重建后再与解密工具给出的 bodySha256 校验一致，见 docs/ranch-protocol-analysis.md。
test('FeedAnimal request encodes to the captured byte-for-byte hex', async () => {
  const root = await loadRoot();
  const Request = root.lookupType('gamepb.animalpb.FeedAnimalRequest');
  const encoded = Request.encode(Request.create({
    target: { ranch_inst_id: 10001, animal_inst_id: 4 },
    count: 2,
  })).finish();
  assert.equal(Buffer.from(encoded).toString('hex'), '0a0508914e10041002');
});

test('AnimalTarget inner message matches captured sha256', async () => {
  const root = await loadRoot();
  const T = root.lookupType('gamepb.animalpb.AnimalTarget');
  const encoded = T.encode(T.create({ ranch_inst_id: 10001, animal_inst_id: 4 })).finish();
  assert.equal(sha256(encoded), '7233aaff1ef892e8773acb8be9995b39e413f6de0ef1dcf6462a077ef3ebb71c');
});

test('PlaceTarget inner message matches captured sha256', async () => {
  const root = await loadRoot();
  const T = root.lookupType('gamepb.animalpb.PlaceTarget');
  const encoded = T.encode(T.create({
    ranch_inst_id: 10001, animal_id: 60002, giant_cub_item_id: 65002,
  })).finish();
  assert.equal(sha256(encoded), '49edbd69854280f2d188c31343c0cd859692f8f24500b64a7d35f1c8bb2914c2');
});

test('SlotTarget inner message matches captured sha256', async () => {
  const root = await loadRoot();
  const T = root.lookupType('gamepb.animalpb.SlotTarget');
  const encoded = T.encode(T.create({ ranch_inst_id: 10001, slot_index: 1 })).finish();
  assert.equal(sha256(encoded), '64efea86b16e5d4a6fa3272559ec77f574dd41668719da448b6ad65c153821b6');
});

test('HarvestRanch request encodes to the captured hex', async () => {
  const root = await loadRoot();
  const Request = root.lookupType('gamepb.animalpb.HarvestRanchRequest');
  const encoded = Request.encode(Request.create({ target: {}, mode: 1 })).finish();
  assert.equal(Buffer.from(encoded).toString('hex'), '12001801');
});

test('GetRanchDetail main-state request is a single empty field 2', async () => {
  const root = await loadRoot();
  const Request = root.lookupType('gamepb.animalpb.GetRanchDetailRequest');
  const encoded = Request.encode(Request.create({ target: {} })).finish();
  assert.equal(Buffer.from(encoded).toString('hex'), '1200');
});

test('GetRanchDetail reply decodes official ranch/animal field numbers', async () => {
  const root = await loadRoot();
  const Reply = root.lookupType('gamepb.animalpb.GetRanchDetailReply');
  // 构造一个最小回复：一个栏舍，内含一只动物，字段 22/24 为 repeated SellLot。
  const payload = {
    ranches: [{
      ranch_inst_id: 10001, capacity: 3, animal_count: 1, husbandry_type: 1,
      animals: [{
        ranch_inst_id: 10001, slot_index: 1, animal_id: 60001, stage: 3,
        expected_harvest_sells: [{ item_id: 1007, count: 3 }],
        expected_produce_sells: [{ item_id: 1007, count: 5 }],
      }],
    }],
  };
  const encoded = Reply.encode(Reply.create(payload)).finish();
  const decoded = Reply.decode(encoded);
  assert.equal(Number(decoded.ranches[0].animals[0].animal_id), 60001);
  assert.equal(Number(decoded.ranches[0].animals[0].expected_harvest_sells[0].count), 3);
  assert.equal(Number(decoded.ranches[0].animals[0].expected_produce_sells[0].count), 5);
});
