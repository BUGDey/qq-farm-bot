const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 数据目录指向临时夹具，cheat-detect 在调用时读取 env，不落真实数据目录
process.env.FARM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cheat-detect-test-'));

const { analyzeFriendCheat } = require('../src/services/cheat-detect');

const ACCOUNT = 'acc_test';
const sampleFile = path.join(process.env.FARM_DATA_DIR, 'interact_samples', `${ACCOUNT}.json`);

function writeFixture(samples, matureHistory = []) {
  fs.mkdirSync(path.dirname(sampleFile), { recursive: true });
  fs.writeFileSync(sampleFile, JSON.stringify({ samples, matureHistory, updatedAt: Date.now() }));
}

// 固定"现在"：今天 12:00（本地时区）
const NOW = new Date(new Date().setHours(12, 0, 0, 0)).getTime();
const HOUR = 3600 * 1000;

test('普通玩家：白天游玩 2 小时、间隔零散、无秒偷 → 绿色（safe）', () => {
  // 12:00-14:00 之间的 8 条记录，间隔刻意不均匀（真人抖动）
  const offsetsMin = [0, 3, 4, 12, 25, 26, 70, 118];
  const samples = offsetsMin.map((min, i) => [
    Math.floor((NOW + min * 60 * 1000) / 1000),
    100,
    i % 2 === 0 ? 2 : 1, // 帮助与偷菜混合
    2,
    '路人',
  ]);
  writeFixture(samples, []);

  const result = analyzeFriendCheat(ACCOUNT, NOW);
  const visitor = result.visitors.find(v => v.nick === '路人');
  assert.ok(visitor, '访客应被统计到');
  assert.equal(visitor.level, 'safe');
  assert.ok(visitor.score < 30, `普通玩家嫌疑分应低于 30，实际 ${visitor.score}`);
  assert.equal(visitor.activeHours24, 2, '12:00-14:00 覆盖 2 个小时桶');
  assert.equal(visitor.insufficientSamples, true, '8 条样本应标注样本不足');
});

test('可疑玩家：在线偏长 + 两次踩点秒偷 + 只偷菜 → 黄色（warn）', () => {
  // 成熟时刻：14:00:00、14:30:00；该访客在成熟后 10 秒内偷走
  const matureAt1 = Math.floor((NOW + 2 * HOUR) / 1000);
  const matureAt2 = Math.floor((NOW + 2.5 * HOUR) / 1000);
  // 08:00-12:30 之间 22 条间隔刻意不均匀的偷菜记录（避开规律分），
  // 覆盖小时桶 8/9/10/11/12，凑足 20 条置信阈值以上
  const base = NOW - 4 * HOUR;
  const offsetsMin = [
    0, 3, 42, 95, 130, 200, 262,
    8, 55, 150, 210, 25, 80, 175, 240,
    12, 61, 118, 33, 90, 145, 225,
  ];
  const samples = offsetsMin.map(min => [
    Math.floor((base + min * 60 * 1000) / 1000), 200, 1, 4, '踩点哥',
  ]);
  // 两次秒偷（成熟后 10 秒）
  samples.push([matureAt1 + 10, 200, 1, 4, '踩点哥']);
  samples.push([matureAt2 + 10, 200, 1, 4, '踩点哥']);
  writeFixture(samples, [matureAt1, matureAt2]);

  const result = analyzeFriendCheat(ACCOUNT, NOW);
  const visitor = result.visitors.find(v => v.nick === '踩点哥');
  assert.ok(visitor, '访客应被统计到');
  assert.equal(visitor.metrics.count, 24, '22 条常规 + 2 条秒偷');
  assert.equal(visitor.metrics.fastStealCount, 2, '两次成熟后 10 秒内偷取都应计为秒偷');
  assert.equal(visitor.insufficientSamples, false, '样本 >= 20 不再标注样本不足');
  assert.equal(visitor.level, 'warn', `在线偏长 + 秒偷两次应为黄色，实际 ${visitor.score}`);
  assert.ok(visitor.score >= 30 && visitor.score < 60, `黄色区间应为 30-59，实际 ${visitor.score}`);
});

test('挂机账号：在线 16 小时、凌晨活跃、间隔均匀、只偷菜、反复秒偷 → 红色（danger）', () => {
  const samples = [];
  const matureHistory = [];
  // 过去 16 小时每小时 4 条，间隔完全均匀（60 秒间隔，cv≈0）
  for (let h = 16; h >= 1; h -= 1) {
    const base = NOW - h * HOUR;
    for (let i = 0; i < 4; i += 1) {
      samples.push([Math.floor((base + i * 60 * 1000) / 1000), 300, 1, 4, '挂机侠']);
    }
  }
  // 三轮成熟后 5 秒即被偷
  for (const offsetH of [3, 2, 1]) {
    const matureAt = Math.floor((NOW - offsetH * HOUR) / 1000);
    matureHistory.push(matureAt);
    samples.push([matureAt + 5, 300, 1, 4, '挂机侠']);
  }
  writeFixture(samples, matureHistory);

  const result = analyzeFriendCheat(ACCOUNT, NOW);
  const visitor = result.visitors.find(v => v.nick === '挂机侠');
  assert.ok(visitor, '访客应被统计到');
  assert.ok(visitor.score >= 60, `挂机账号嫌疑分应 >= 60，实际 ${visitor.score}`);
  assert.equal(visitor.level, 'danger');
  assert.equal(visitor.insufficientSamples, false, '样本充足不标注样本不足');
  assert.ok(visitor.metrics.fastStealCount >= 3, '秒偷次数应 >= 3');
});

test('秒偷窗口边界：成熟 61 秒后偷取不计为秒偷', () => {
  const matureAt = Math.floor((NOW - 2 * HOUR) / 1000);
  const samples = [
    [matureAt + 61, 400, 1, 2, '手慢哥'],
  ];
  writeFixture(samples, [matureAt]);

  const result = analyzeFriendCheat(ACCOUNT, NOW);
  const visitor = result.visitors.find(v => v.nick === '手慢哥');
  assert.ok(visitor, '访客应被统计到');
  assert.equal(visitor.metrics.fastStealCount, 0, '超过 60 秒窗口不应计秒偷');
  assert.equal(visitor.level, 'safe');
  assert.equal(visitor.insufficientSamples, true, '1 条样本应标注样本不足');
});

test('样本不足（<20 条）：嫌疑分压缩封顶且不标记可疑/高活跃', () => {
  // 构造一个"本该红色"的访客但只有 10 条样本：小时级均匀间隔（规律分满分）、
  // 覆盖 10 个小时桶（活跃分满分）、含凌晨时段（凌晨分）、只偷菜（单一行为分）
  const samples = [];
  for (let h = 10; h >= 1; h -= 1) {
    samples.push([Math.floor((NOW - h * HOUR) / 1000), 600, 1, 4, '小样本哥']);
  }
  writeFixture(samples, []);

  const result = analyzeFriendCheat(ACCOUNT, NOW);
  const visitor = result.visitors.find(v => v.nick === '小样本哥');
  assert.ok(visitor, '访客应被统计到');
  assert.equal(visitor.metrics.count, 10, '10 条样本');
  assert.equal(visitor.insufficientSamples, true, '低于 20 条应标注样本不足');
  assert.equal(visitor.level, 'safe', '样本不足时不得标记可疑（即使原始分很高）');
  assert.equal(visitor.highActive, false, '样本不足时不得标记高活跃');
  assert.ok(visitor.score <= 29, `样本不足嫌疑分应封顶在关注线之下，实际 ${visitor.score}`);
  assert.ok(result.sampleMinTrust === 20, '分析结果应携带样本置信阈值');
});

test('样本去重：同一秒同一访客同一动作只计一次', () => {
  const { recordInteractSamples } = require('../src/services/cheat-detect');
  const ts = Math.floor(NOW / 1000);
  const dup = [
    { serverTimeSec: ts, visitorGid: 500, actionType: 1, cropCount: 1, nick: '重复哥' },
    { serverTimeSec: ts, visitorGid: 500, actionType: 1, cropCount: 1, nick: '重复哥' },
    { serverTimeSec: ts, visitorGid: 500, actionType: 1, cropCount: 1, nick: '重复哥' },
  ];
  const added = recordInteractSamples(ACCOUNT, dup, NOW);
  assert.equal(added, 1, '三条完全重复的记录只应新增 1 条');

  const result = analyzeFriendCheat(ACCOUNT, NOW);
  const visitor = result.visitors.find(v => v.nick === '重复哥');
  assert.ok(visitor);
  assert.equal(visitor.metrics.count, 1, '重复样本应去重');
});
