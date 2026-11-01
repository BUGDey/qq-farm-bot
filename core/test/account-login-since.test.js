const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 用临时数据目录，避免写到真实 core/data
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqfarm-loginsince-'));
process.env.FARM_DATA_DIR = tmpDir;

const store = require('../src/models/store');

test('loginSince 只在首次登录时写入，刷新 Code 不重置', () => {
  const data = store.addOrUpdateAccount({ name: 'a1', loginType: 'manual' });
  const id = String(data.accounts[0].id);
  assert.equal(store.getAccountLoginSince(id), 0);

  const first = store.markAccountLogin(id, 1000);
  assert.equal(first, 1000);
  assert.equal(store.getAccountLoginSince(id), 1000);

  // 模拟刷新 Code 后重新登录：已记录的时间戳不能被覆盖
  assert.equal(store.markAccountLogin(id, 5000), 1000);
  assert.equal(store.getAccountLoginSince(id), 1000);

  // 更新账号信息（例如改名、换凭证）也不能丢
  store.addOrUpdateAccount({ id, name: 'a1-renamed', loginBuffer: 'new-buffer' });
  assert.equal(store.getAccountLoginSince(id), 1000);

  // 用户手动停止账号后清空，下次登录重新计时
  assert.equal(store.clearAccountLogin(id), true);
  assert.equal(store.getAccountLoginSince(id), 0);
  assert.equal(store.markAccountLogin(id, 9000), 9000);
});

test('markAccountLogin 对不存在的账号返回 0', () => {
  assert.equal(store.markAccountLogin('9999', 1000), 0);
  assert.equal(store.clearAccountLogin('9999'), false);
  assert.equal(store.getAccountLoginSince(''), 0);
});
