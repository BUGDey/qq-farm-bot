const assert = require('node:assert');
const test = require('node:test');

// 释放 QQ 登录态之前要先确认「没有正在扫码」。
test('没有扫码任务时 hasActiveTasks 为 false', () => {
  const napcat = require('../src/services/napcat-login');
  assert.strictEqual(typeof napcat.hasActiveTasks, 'function');
  assert.strictEqual(napcat.hasActiveTasks(), false);
});

test('releaseIdleSession 在未配置 NapCat 时安静返回', async () => {
  const napcat = require('../src/services/napcat-login');
  const previous = process.env.NAPCAT_LOGIN_ENABLED;
  process.env.NAPCAT_LOGIN_ENABLED = 'false';
  try {
    const result = await napcat.releaseIdleSession();
    assert.strictEqual(result, false);
  } finally {
    if (previous === undefined) delete process.env.NAPCAT_LOGIN_ENABLED;
    else process.env.NAPCAT_LOGIN_ENABLED = previous;
  }
});