/* 免费卡密领取（发号机）测试：开关/描述过滤/双维度限频/预约锁定/全局限速/核销限制 */
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-free-card-'));
process.env.FARM_DATA_DIR = tmpDir;
process.env.FARM_ADMIN_USERNAME = 'admin';
process.env.FARM_ADMIN_PASSWORD = 'Admin@12345';

const userStore = require('../src/models/user-store');
const { CARD_TYPES } = require('../src/config/user-system');

const CLAIM_FILE = path.join(tmpDir, 'card-claim.json');

function makeCard(description, days = 3, type = CARD_TYPES.TIME) {
  const result = userStore.createCard({ description, type, days, createdBy: 'test' });
  assert.ok(result.ok, `造卡失败: ${result.error}`);
  return result.cards[0];
}

function enableClaim() {
  userStore.setCardClaimStatus(true);
}

function readClaimDoc() {
  return JSON.parse(fs.readFileSync(CLAIM_FILE, 'utf8'));
}

function writeClaimDoc(doc) {
  fs.writeFileSync(CLAIM_FILE, JSON.stringify(doc));
}

describe('免费卡密领取', () => {
  it('功能关闭时领取提示管理员已关闭', () => {
    userStore.setCardClaimStatus(false);
    const result = userStore.claimCardByUA('ua-off', null, '1.1.1.1');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, '管理员已关闭免费功能');
  });

  it('没有描述为「免费」的加时卡时提示数量不足', () => {
    makeCard('普通卡', 7);
    makeCard('免费体验', 3); // 描述不是严格的「免费」两个字
    makeCard('免费', 3, CARD_TYPES.QUOTA); // 额度卡不算
    enableClaim();
    const result = userStore.claimCardByUA('ua-empty', null, '2.2.2.2');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, '卡密数量不足请联系管理员');
  });

  it('领取成功：只挑描述严格为「免费」的加时卡', () => {
    const free = makeCard('免费', 5);
    const result = userStore.claimCardByUA('ua-a', null, '3.3.3.3');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.cardCode, free.code);
    assert.strictEqual(result.description, '免费');
    assert.match(result.valueText, /5/);
    // 库存状态只数免费加时卡
    assert.strictEqual(userStore.getCardClaimStatus().availableTimeCards, 1);
  });

  it('同一 UA 或同一 IP 24 小时内只能领一张', () => {
    // 限频判断在库存检查之前，无需新卡
    const sameUA = userStore.claimCardByUA('ua-a', null, '9.9.9.9');
    assert.strictEqual(sameUA.ok, false);
    assert.match(sameUA.error, /24 小时/);
    const sameIP = userStore.claimCardByUA('ua-b', null, '3.3.3.3');
    assert.strictEqual(sameIP.ok, false);
    assert.match(sameIP.error, /24 小时/);
  });

  it('领取即预约锁定：他人领不到同一张；过期后自动释放', () => {
    // 此时库存里只剩上一张被 ua-a 预约的免费卡
    const blocked = userStore.claimCardByUA('ua-c', null, '4.4.4.4');
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(blocked.error, '卡密数量不足请联系管理员');

    // 把预约过期时间改到过去，模拟 30 分钟未注册自动释放
    const doc = readClaimDoc();
    doc.reservations = doc.reservations.map(r => ({ ...r, expiresAt: 1 }));
    doc.records = []; // 清空限频记录，隔离本用例
    writeClaimDoc(doc);

    const released = userStore.claimCardByUA('ua-c', null, '4.4.4.4');
    assert.strictEqual(released.ok, true, `预约过期后应能领到: ${released.error}`);
  });

  it('全局发放速度阀：超过每小时上限时拒绝', () => {
    makeCard('免费', 1);
    const doc = readClaimDoc();
    doc.records = [];
    doc.reservations = [];
    writeClaimDoc(doc);
    const first = userStore.claimCardByUA('ua-d', null, '5.5.5.5', { globalHourlyLimit: 1 });
    assert.strictEqual(first.ok, true);
    const second = userStore.claimCardByUA('ua-e', null, '6.6.6.6', { globalHourlyLimit: 1 });
    assert.strictEqual(second.ok, false);
    assert.match(second.error, /人数较多/);
  });

  it('免费卡密只能注册：registerUser 可用，redeemCard 续费被拒', () => {
    const doc = readClaimDoc();
    doc.records = [];
    doc.reservations = [];
    writeClaimDoc(doc);

    const regCard = makeCard('免费', 2);
    const reg = userStore.registerUser('freeuser1', 'Passw0rd!', regCard.code);
    assert.strictEqual(reg.ok, true, `免费卡注册失败: ${reg.error}`);

    const renewCard = makeCard('免费', 10);
    const renew = userStore.redeemCard('freeuser1', renewCard.code, { operator: 'freeuser1' });
    assert.strictEqual(renew.ok, false);
    assert.match(renew.error, /仅可用于注册新账号/);
    // 卡未被消耗
    const status = userStore.getCardClaimStatus();
    assert.ok(status.availableTimeCards >= 1);
  });
});
