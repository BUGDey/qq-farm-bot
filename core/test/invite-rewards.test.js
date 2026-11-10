/**
 * 邀请奖励：奖励发放与防刷闸门
 *
 * 用一个内存版 userStore 替身，专注验证规则，不碰真实数据文件。
 */
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqfarm-invite-'));
process.env.QQFARM_INVITE_FILE = path.join(tmpDir, 'invites.json');

const invite = require('../src/services/invite-rewards');

const DAY = 24 * 60 * 60 * 1000;

function fakeUserStore(seed = {}) {
  const users = {
    alice: { username: 'alice', createdAt: Date.now() - 5 * DAY, subscription: { enabled: true } },
    ...seed,
  };
  const granted = [];
  return {
    users,
    granted,
    getUserByName(name) {
      return users[name] || null;
    },
    extendSubscriptionByDays(name, days, meta) {
      // 被邀请人此时刚注册完，替身里还没有这条记录，按真实行为补建
      if (!users[name]) users[name] = { username: name, createdAt: Date.now(), subscription: { enabled: true } };
      granted.push({ username: name, days, reason: meta?.reason });
      return { ok: true, addedMs: days * DAY };
    },
  };
}

function resetState(patch = {}) {
  if (fs.existsSync(process.env.QQFARM_INVITE_FILE)) {
    fs.rmSync(process.env.QQFARM_INVITE_FILE, { force: true });
  }
  invite.saveSettings({ enabled: true, inviterDays: 3, inviteeDays: 2, ...patch });
}

test('邀请码按用户生成且保持不变', () => {
  resetState();
  const first = invite.ensureCodeFor('alice');
  const second = invite.ensureCodeFor('alice');
  assert.strictEqual(first, second);
  assert.match(first, /^[A-Z2-9]{8}$/);
  assert.notStrictEqual(invite.ensureCodeFor('bob'), first);
});

test('绑定挂机账号后才给双方发奖', () => {
  resetState();
  const store = fakeUserStore();
  const code = invite.ensureCodeFor('alice');

  const result = invite.handleRegistration({ inviteCode: code, invitee: 'carol', ip: '1.1.1.1', userStore: store });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.pending, true);
  assert.strictEqual(result.inviteeDays, 0, '绑定前不发天数，避免注册小号即领奖');
  assert.deepStrictEqual(store.granted, []);

  const summary = invite.getUserSummary('alice');
  assert.strictEqual(summary.pendingCount, 1);
  assert.strictEqual(summary.earnedDays, 0);

  const bound = invite.markInviteeBound('carol', store, invite.identityFromAccount({ platform: 'qq', uin: '10001000' }));
  assert.strictEqual(bound.settled, 1);
  assert.deepStrictEqual(store.granted, [
    { username: 'carol', days: 2, reason: 'invite' },
    { username: 'alice', days: 3, reason: 'invite' },
  ]);

  const after = invite.getUserSummary('alice');
  assert.strictEqual(after.grantedCount, 1);
  assert.strictEqual(after.earnedDays, 3);
});

test('同一个挂机账号不能被不同账号重复领奖', () => {
  resetState();
  const store = fakeUserStore();
  const code = invite.ensureCodeFor('alice');
  const identity = invite.identityFromAccount({ platform: 'qq', uin: '10001000' });

  invite.handleRegistration({ inviteCode: code, invitee: 'erin', ip: '2.2.2.2', userStore: store });
  assert.strictEqual(invite.markInviteeBound('erin', store, identity).settled, 1);

  // 老用户又拿自己的码注册了个小号，想再绑同一个 QQ 号
  store.users.frank = { username: 'frank', createdAt: Date.now(), subscription: { enabled: true } };
  const again = invite.handleRegistration({ inviteCode: code, invitee: 'frank', ip: '3.3.3.3', userStore: store });
  assert.strictEqual(again.ok, true, '注册本身不受影响');

  const denied = invite.markInviteeBound('frank', store, identity);
  assert.strictEqual(denied.ok, false);
  assert.strictEqual(denied.reason, 'identity_reused');
  assert.strictEqual(denied.owner, 'erin');
});

test('自己邀请自己无效', () => {
  resetState();
  const store = fakeUserStore();
  const code = invite.ensureCodeFor('alice');
  const result = invite.handleRegistration({ inviteCode: code, invitee: 'alice', ip: '1.1.1.1', userStore: store });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'self_invite');
  assert.strictEqual(store.granted.length, 0);
});

test('同一个新账号只能被邀请一次', () => {
  resetState();
  const store = fakeUserStore();
  const code = invite.ensureCodeFor('alice');
  assert.strictEqual(invite.handleRegistration({ inviteCode: code, invitee: 'dave', ip: '1.1.1.1', userStore: store }).ok, true);
  const again = invite.handleRegistration({ inviteCode: code, invitee: 'dave', ip: '1.1.1.1', userStore: store });
  assert.strictEqual(again.ok, false);
  assert.strictEqual(again.reason, 'invitee_already_used');
});

test('注册不满 24 小时的新号不能当邀请人', () => {
  resetState();
  const store = fakeUserStore({ fresh: { username: 'fresh', createdAt: Date.now(), subscription: { enabled: true } } });
  invite.ensureCodeFor('fresh');
  const code = invite.ensureCodeFor('fresh');
  const result = invite.handleRegistration({ inviteCode: code, invitee: 'erin', ip: '1.1.1.1', userStore: store });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'inviter_too_new');
});

test('同 IP 每天超过上限不再计入', () => {
  resetState({ maxPerIpPerDay: 2 });
  const store = fakeUserStore();
  const code = invite.ensureCodeFor('alice');
  assert.strictEqual(invite.handleRegistration({ inviteCode: code, invitee: 'u1', ip: '9.9.9.9', userStore: store }).ok, true);
  assert.strictEqual(invite.handleRegistration({ inviteCode: code, invitee: 'u2', ip: '9.9.9.9', userStore: store }).ok, true);
  const third = invite.handleRegistration({ inviteCode: code, invitee: 'u3', ip: '9.9.9.9', userStore: store });
  assert.strictEqual(third.ok, false);
  assert.strictEqual(third.reason, 'ip_daily_limit');
});

test('总开关关闭时不发任何奖励', () => {
  resetState({ enabled: false });
  const store = fakeUserStore();
  const code = invite.ensureCodeFor('alice');
  const result = invite.handleRegistration({ inviteCode: code, invitee: 'frank', ip: '2.2.2.2', userStore: store });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'disabled');
  assert.strictEqual(store.granted.length, 0);
});

test('规则边界值被夹紧，不会出现负天数或超大天数', () => {
  const settings = invite.normalizeSettings({ inviterDays: -5, inviteeDays: 999999, maxPerIpPerDay: -1, minInviterAgeHours: -2 });
  assert.strictEqual(settings.inviterDays, 0);
  assert.strictEqual(settings.inviteeDays, 3650);
  assert.strictEqual(settings.maxPerIpPerDay, 0);
  assert.strictEqual(settings.minInviterAgeHours, 0);
});