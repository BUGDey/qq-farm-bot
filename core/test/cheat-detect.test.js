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
});

test('可疑玩家：在线 5 小时 + 两次踩点秒偷 + 只偷菜 → 黄色（warn）', () => {
  // 成熟时刻：14:00:00；该访客在 14:00:10、14:30:10 两次成熟后 10 秒内偷走
  const matureAt1 = Math.floor((NOW + 2 * HOUR) / 1000);
  const matureAt2 = Math.floor((NOW + 2.5 * HOUR) / 1000);
  // 09:00-14:00 覆盖 5 个小时桶（>=4h 开始怀疑），间隔刻意不均匀（避开规律分）
  const samples = [];
  const offsetsMin = [0, 5, 40, 95, 260];
  for (const min of offsetsMin) {
    samples.push([Math.floor((NOW - 4 * HOUR + min * 60 * 1000) / 1000), 200, 1, 4, '踩点哥']);
  }
  // 两次秒偷（成熟后 10 秒）
  samples.push([matureAt1 + 10, 200, 1, 4, '踩点哥']);
  samples.push([matureAt2 + 10, 200, 1, 4, '踩点哥']);
  writeFixture(samples, [matureAt1, matureAt2]);

  const result = analyzeFriendCheat(ACCOUNT, NOW);
  const visitor = result.visitors.find(v => v.nick === '踩点哥');
  assert.ok(visitor, '访客应被统计到');
  assert.equal(visitor.metrics.fastStealCount, 2, '两次成熟后 10 秒内偷取都应计为秒偷');
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
