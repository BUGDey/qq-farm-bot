const test = require('node:test');
const assert = require('node:assert/strict');

const { createDataProvider } = require('../src/runtime/data-provider');

const HOUR = 60 * 60 * 1000;

function createProvider(accounts, workers = {}) {
  return createDataProvider({
    workers,
    globalLogs: [],
    accountLogs: [],
    store: {
      getSystemConfig: () => ({ credentialValidityHours: 2 }),
    },
    getAccounts: () => ({ accounts: structuredClone(accounts) }),
    filterLogs: logs => logs,
  });
}

test('WeChat credential expiry counts from the latest credential write time', () => {
  const createdAt = 1_700_000_000_000;
  const credentialUpdatedAt = createdAt + 90 * 60 * 1000;
  const provider = createProvider([{
    id: 'wx-1',
    platform: 'wx',
    loginBuffer: 'rotated-buffer',
    credentialUpdatedAt,
    createdAt,
  }]);

  const account = provider.getAccounts().accounts[0];

  assert.equal(account.credentialExpireAt, credentialUpdatedAt + 2 * HOUR);
  assert.equal(account.credentialUpdatedAt, credentialUpdatedAt);
  assert.equal(account.hasWxCredential, true);
});

test('re-scanning or refreshing the credential restarts the countdown', () => {
  const createdAt = 1_700_000_000_000;
  const expiryFor = credentialUpdatedAt => createProvider([{
    id: 'wx-1',
    platform: 'wx',
    loginBuffer: `buffer-${credentialUpdatedAt}`,
    credentialUpdatedAt,
    createdAt,
  }]).getAccounts().accounts[0].credentialExpireAt;

  const first = expiryFor(createdAt);
  const rescanned = expiryFor(createdAt + 90 * 60 * 1000);

  assert.equal(first, createdAt + 2 * HOUR);
  // 重新扫码/凭证轮转后倒计时必须重新开始，而不是永远停在“已超过预计时长”
  assert.equal(rescanned, createdAt + 90 * 60 * 1000 + 2 * HOUR);
  assert.ok(rescanned > first);
});

test('legacy accounts without credentialUpdatedAt fall back to createdAt', () => {
  const createdAt = 1_700_000_000_000;
  const account = createProvider([{
    id: 'legacy',
    platform: 'wx',
    loginBuffer: 'buffer',
    createdAt,
  }]).getAccounts().accounts[0];

  assert.equal(account.credentialExpireAt, createdAt + 2 * HOUR);
  assert.equal(account.credentialUpdatedAt, createdAt);
});

test('online reflects confirmed connection state rather than worker existence', () => {
  const accounts = [
    { id: 'online', platform: 'wx', loginBuffer: 'buffer', createdAt: 1_700_000_000_000 },
    { id: 'offline', platform: 'wx', loginBuffer: 'buffer', createdAt: 1_700_000_000_000 },
    { id: 'no-status', platform: 'wx', loginBuffer: 'buffer', createdAt: 1_700_000_000_000 },
  ];
  const workers = {
    online: { status: { connection: { connected: true } } },
    offline: { status: { connection: { connected: false } } },
    'no-status': {},
  };

  const listed = createProvider(accounts, workers).getAccounts().accounts;

  assert.equal(listed[0].running, true);
  assert.equal(listed[0].online, true);
  assert.equal(listed[1].running, true);
  assert.equal(listed[1].online, false);
  assert.equal(listed[2].running, true);
  assert.equal(listed[2].online, false);
});

test('accounts without a WeChat credential or any timestamp have no expiry estimate', () => {
  const accounts = [
    { id: 'no-credential', platform: 'wx', createdAt: 1_700_000_000_000 },
    { id: 'no-timestamp', platform: 'wx', loginBuffer: 'buffer' },
    { id: 'qq', platform: 'qq', loginBuffer: 'unrelated', createdAt: 1_700_000_000_000 },
  ];

  const listed = createProvider(accounts).getAccounts().accounts;

  assert.deepEqual(listed.map(account => account.credentialExpireAt), [0, 0, 0]);
  assert.deepEqual(listed.map(account => account.hasWxCredential), [false, true, false]);
});
