const test = require('node:test');
const assert = require('node:assert');

const guard = require('../src/services/kick-guard');

test('外部顶号连续三次才停止自动重登，网络类原因不受影响', () => {
  guard.reset('acc-1');
  assert.strictEqual(guard.shouldStopAutoRelogin('acc-1', '已在其他终端登录'), false);
  assert.strictEqual(guard.shouldStopAutoRelogin('acc-1', '其他设备登录'), false);
  assert.strictEqual(guard.shouldStopAutoRelogin('acc-1', 'other terminal login'), false);
  assert.strictEqual(guard.shouldStopAutoRelogin('acc-1', '已在其他终端登录'), true);

  guard.reset('acc-2');
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(guard.shouldStopAutoRelogin('acc-2', '网络断开'), false);
  }
});

test('被顶号后一段时间内视为「刚被顶过」，供定时刷新避让', () => {
  guard.reset('acc-3');
  assert.strictEqual(guard.isRecentlyKicked('acc-3'), false);
  guard.markKick('acc-3');
  assert.strictEqual(guard.isRecentlyKicked('acc-3'), true);
  // 窗口外不再算「刚被顶过」
  const longAgo = Date.now() - guard.RECENT_MS - 1000;
  guard.reset('acc-4');
  guard.markKick('acc-4', longAgo);
  assert.strictEqual(guard.isRecentlyKicked('acc-4'), false);
});

test('窗口外的旧记录会被清理，不会永远累计', () => {
  guard.reset('acc-5');
  const old = Date.now() - guard.WINDOW_MS - 1000;
  guard.markKick('acc-5', old);
  guard.markKick('acc-5', old);
  guard.markKick('acc-5', old);
  assert.strictEqual(guard.recentCount('acc-5'), 0);
  assert.strictEqual(guard.shouldStopAutoRelogin('acc-5', '已在其他终端登录'), false);
});