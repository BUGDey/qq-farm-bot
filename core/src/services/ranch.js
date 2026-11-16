/**
 * 牧场（栏舍动物）服务
 *
 * 协议字段来自官方小程序生成代码 + TSDK 解密抓包，见 docs/ranch-protocol-analysis.md
 * 与 core/src/proto/animalpb.proto。只实现有成功抓包样本的 RPC；
 * CollectProduce/HarvestAnimal/DonateAnimal/StealProduce/CleanRanch/PutHazard
 * 因无请求样本，按技能红线「不猜协议」暂不实现。
 */
const { types } = require('../utils/proto');
const { sendMsgAsync } = require('../utils/network');
const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('ranch');

const ANIMAL_SERVICE = 'gamepb.animalpb.AnimalService';
const RANCH_SERVICE = 'gamepb.animalpb.RanchService';
const FEED_SERVICE = 'gamepb.homesteadpb.FeedMachineService';

/**
 * 统一调用：编码请求 -> 发送 -> 解码回复。
 * @param {string} service 服务名
 * @param {string} method 方法名
 * @param {string} reqType 请求类型名
 * @param {string} replyType 回复类型名
 * @param {object} payload 请求字段
 */
async function call(service, method, reqType, replyType, payload = {}) {
  const Req = types[reqType];
  const Reply = types[replyType];
  if (!Req || !Reply) throw new Error(`牧场协议类型未加载: ${reqType}/${replyType}`);
  const body = Req.encode(Req.create(payload)).finish();
  const { body: replyBody } = await sendMsgAsync(service, method, body);
  if (!replyBody || !replyBody.length) return {};
  try {
    // protobufjs 的 int64 默认解码为 Long 对象、bytes 为 Buffer；若直接把 Message 实例
    // 交给 IPC/前端，会渲染成 { low, high, unsigned } / { "0": 8, "1": 71 } 这类裸结构。
    // 与项目其它活动一致（activity-milk-tea.js 等），统一转成普通对象：
    // longs:String → 十进制字符串，bytes:String → base64 字符串，defaults:true 补齐 0/空字段。
    return Reply.toObject(Reply.decode(replyBody), {
      longs: String,
      enums: String,
      bytes: String,
      defaults: true,
    });
  } catch (err) {
    logger.error('牧场回复解码失败', { method, error: err.message });
    return {};
  }
}

/** 把 protobuf 回复转成普通对象（int64 → Number/string），便于 IPC 传输 */
function plain(value) {
  if (value == null) return value;
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value.toString();
  }
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = plain(v);
    return out;
  }
  if (typeof value === 'object' && value.constructor && value.constructor.name !== 'Object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = plain(v);
    return out;
  }
  return value;
}

// ============ AnimalService ============

/** 栏舍详情。hostGid>0 为客态（不回写本地家园数据）。 */
async function getRanchDetail(hostGid = 0) {
  const payload = hostGid > 0
    ? { host_gid: Number(hostGid), target: {} }
    : { target: {} };
  const reply = await call(ANIMAL_SERVICE, 'GetRanchDetail', 'GetRanchDetailRequest', 'GetRanchDetailReply', payload);
  return plain(reply);
}

/** 幼崽入栏。ranchInstId / animalId / giantCubItemId 均来自官方 PlaceTarget 定义。 */
async function placeAnimal(ranchInstId, animalId, giantCubItemId = 0) {
  const payload = { target: {
    ranch_inst_id: Number(ranchInstId),
    animal_id: Number(animalId),
    giant_cub_item_id: Number(giantCubItemId) || 0,
  } };
  const reply = await call(ANIMAL_SERVICE, 'PlaceAnimal', 'PlaceAnimalRequest', 'PlaceAnimalReply', payload);
  return plain(reply);
}

/** 开始生产。slot 为空 = 一键。 */
async function triggerProduce(ranchInstId = 0, slotIndex = 0) {
  const payload = slotIndex > 0
    ? { target: { ranch_inst_id: Number(ranchInstId), slot_index: Number(slotIndex) } }
    : {};
  const reply = await call(ANIMAL_SERVICE, 'TriggerProduce', 'TriggerProduceRequest', 'TriggerProduceReply', payload);
  return plain(reply);
}

/** 一键收获。mode 来自抓包（常见 1）。 */
async function harvestRanch(mode = 1) {
  const reply = await call(ANIMAL_SERVICE, 'HarvestRanch', 'HarvestRanchRequest', 'HarvestRanchReply', {
    target: {},
    mode: Number(mode) || 1,
  });
  return plain(reply);
}

/** 喂罐头桶。animalInstId 为动物序号，count 为投喂数量。 */
async function feedAnimal(ranchInstId, animalInstId, count = 1) {
  const reply = await call(ANIMAL_SERVICE, 'FeedAnimal', 'FeedAnimalRequest', 'FeedAnimalReply', {
    target: { ranch_inst_id: Number(ranchInstId), animal_inst_id: Number(animalInstId) },
    count: Number(count) || 1,
  });
  return plain(reply);
}

// ============ RanchService ============

/** 使坏次数（主态传空）。 */
async function getRanchOpTimes() {
  const reply = await call(RANCH_SERVICE, 'GetRanchOpTimes', 'GetRanchOpTimesRequest', 'GetRanchOpTimesReply', {
    target: {},
  });
  return plain(reply);
}

/** 撸动物（客态 hostGid>0）。 */
async function strokeAnimal(hostGid, ranchInstId, slotIndex) {
  const reply = await call(RANCH_SERVICE, 'StrokeAnimal', 'StrokeAnimalRequest', 'StrokeAnimalReply', {
    host_gid: Number(hostGid) || 0,
    target: { ranch_inst_id: Number(ranchInstId), slot_index: Number(slotIndex) },
  });
  return plain(reply);
}

/** 一键清理（客态 hostGid>0）。 */
async function cleanAllRanch(hostGid = 0) {
  const reply = await call(RANCH_SERVICE, 'CleanAllRanch', 'CleanAllRanchRequest', 'CleanAllRanchReply', {
    host_gid: Number(hostGid) || 0,
    target: {},
  });
  return plain(reply);
}

// ============ FeedMachineService ============

/** 加牧草。instanceId 为机器实例 ID（抓包 10002），addCount 数量。 */
async function addFeed(instanceId, addCount = 100, useGold = 0, hostGid = 0) {
  const reply = await call(FEED_SERVICE, 'AddFeed', 'AddFeedRequest', 'AddFeedReply', {
    instance_id: Number(instanceId),
    add_count: Number(addCount) || 100,
    use_gold: Number(useGold) || 0,
    host_gid: Number(hostGid) || 0,
  });
  return plain(reply);
}

module.exports = {
  getRanchDetail,
  placeAnimal,
  triggerProduce,
  harvestRanch,
  feedAnimal,
  getRanchOpTimes,
  strokeAnimal,
  cleanAllRanch,
  addFeed,
};
