/**
 * 活动插件读 proto 的回归测试
 *
 * 线上出现过「节令小札读取失败：readProtoFields is not a function」：
 * 插件从 worker-host 传入的 helpers 里取这几个工具，但 helpers 一直没导出它们。
 */
const assert = require('node:assert');
const test = require('node:test');

const PROTO_HELPERS = [
  'readProtoFields',
  'getProtoNumber',
  'getProtoBytes',
  'getProtoBytesAll',
  'getProtoString',
  'parseActivityItemMessage',
];

test('helpers 暴露活动插件需要的 proto 读取工具', () => {
  const helpers = require('../src/services/activity-center-helpers');
  for (const name of PROTO_HELPERS) {
    assert.strictEqual(typeof helpers[name], 'function', `${name} 应该是函数`);
  }
});

test('helpers.readProtoFields 能解析 varint 字段', () => {
  const helpers = require('../src/services/activity-center-helpers');
  // field 1 = 7, field 2 = 300
  const buf = Buffer.from([0x08, 0x07, 0x10, 0xac, 0x02]);
  const entries = helpers.readProtoFields(buf);

  assert.strictEqual(helpers.getProtoNumber(entries, 1), 7);
  assert.strictEqual(helpers.getProtoNumber(entries, 2), 300);
  assert.strictEqual(helpers.getProtoNumber(entries, 9, -1), -1);
});

test('activity 与 helpers 拿到的是同一套实现', () => {
  const activity = require('../src/services/activity');
  const helpers = require('../src/services/activity-center-helpers');
  const buf = Buffer.from([0x08, 0x0f]);

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(helpers.readProtoFields(buf))),
    JSON.parse(JSON.stringify(activity.readProtoFields(buf))),
  );
});