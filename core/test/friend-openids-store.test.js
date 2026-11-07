const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpFile = path.join(os.tmpdir(), `friend-openids-${process.pid}.json`);
process.env.QQFARM_FRIEND_OPENIDS_FILE = tmpFile;

const openIds = require('../src/services/friend-openids');

test.after(() => {
  try {
    fs.unlinkSync(tmpFile);
  } catch {
    // ignore
  }
});

test('从好友对象里收集 open_id，做去重与大写归一', () => {
  openIds.rememberOpenIds([]);
  const added = openIds.harvestFromFriends([
    { gid: 1, open_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: '甲' },
    { gid: 2, openId: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', name: '乙' },
    { gid: 3, open_id: 'not-an-openid' },
    { gid: 4, open_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: '重复' },
  ]);
  assert.equal(added, 2);
  assert.deepEqual(openIds.getOpenIds().sort(), [
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  ]);
  assert.equal(openIds.getCount(), 2);
});

test('重复收集不会重复计数', () => {
  const added = openIds.harvestFromFriends([
    { gid: 1, open_id: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', name: '甲' },
  ]);
  assert.equal(added, 0);
  assert.equal(openIds.getCount(), 2);
});