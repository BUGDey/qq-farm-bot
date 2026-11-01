const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-farm-mailer-'));
process.env.FARM_DATA_DIR = dataDir;

const store = require('../src/models/store');

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const { normalizeGlobalMailer, isGlobalMailerReady, normalizeOfflineReminder } = store._test;

test('normalizeGlobalMailer fills defaults and clamps port', () => {
  const empty = normalizeGlobalMailer(null);
  assert.equal(empty.enabled, false);
  assert.equal(empty.smtpPort, 465);
  assert.equal(empty.subject, 'QQ 农场智能助手通知');

  const bad = normalizeGlobalMailer({ smtpPort: 99999, enabled: 'true' });
  assert.equal(bad.smtpPort, 465);
  assert.equal(bad.enabled, true);
});

test('isGlobalMailerReady requires enabled and full smtp credentials', () => {
  assert.equal(isGlobalMailerReady({ enabled: true, smtpHost: 'smtp.qq.com', smtpUser: 'a@qq.com', smtpPass: 'x' }), true);
  assert.equal(isGlobalMailerReady({ enabled: false, smtpHost: 'smtp.qq.com', smtpUser: 'a@qq.com', smtpPass: 'x' }), false);
  assert.equal(isGlobalMailerReady({ enabled: true, smtpHost: 'smtp.qq.com', smtpUser: 'a@qq.com', smtpPass: '' }), false);
  assert.equal(isGlobalMailerReady({ enabled: true, smtpHost: '', smtpUser: 'a@qq.com', smtpPass: 'x' }), false);
});

test('normalizeOfflineReminder keeps useGlobalMailer flag', () => {
  assert.equal(normalizeOfflineReminder({}).useGlobalMailer, false);
  assert.equal(normalizeOfflineReminder({ useGlobalMailer: true }).useGlobalMailer, true);
  assert.equal(normalizeOfflineReminder({ useGlobalMailer: 'true' }).useGlobalMailer, true);
});

test('setGlobalMailer keeps previous password when blank is submitted', () => {
  const saved = store.setGlobalMailer({
    enabled: true,
    smtpHost: 'smtp.qq.com',
    smtpPort: 465,
    smtpUser: 'bot@qq.com',
    smtpPass: 'secret-1',
    senderName: '农场助手',
  });
  assert.equal(saved.ready, true);
  assert.equal(saved.smtpPass, 'secret-1');

  // 前端回传时授权码是空串，表示「不修改」
  const updated = store.setGlobalMailer({ senderName: '新名称', smtpPass: '' });
  assert.equal(updated.smtpPass, 'secret-1');
  assert.equal(updated.senderName, '新名称');
  assert.equal(updated.ready, true);

  // 公开状态不暴露账号密码
  const publicView = store.getGlobalMailerPublic();
  assert.deepEqual(Object.keys(publicView).sort(), ['available', 'senderName']);
  assert.equal(publicView.available, true);
});

test('global mailer disabled makes public status unavailable', () => {
  store.setGlobalMailer({ enabled: false });
  const publicView = store.getGlobalMailerPublic();
  assert.equal(publicView.available, false);
});
