const test = require('node:test');
const assert = require('node:assert/strict');

const { createDataProvider } = require('../src/runtime/data-provider');

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

test('WeChat credential expiry is based on account creation time, not credential refresh time', () => {
  const createdAt = 1_700_000_000_000;
  const provider = createProvider([{
    id: 'wx-1',
    platform: 'wx',
    loginBuffer: 'rotated-buffer',
    credentialUpdatedAt: createdAt + 90 * 60 * 1000,
    createdAt,
  }]);

  const account = provider.getAccounts().accounts[0];

  assert.equal(account.credentialExpireAt, createdAt + 2 * 60 * 60 * 1000);
  assert.equal(account.hasWxCredential, true);
});

test('credential refresh timestamps do not change the first-added countdown', () => {
  const createdAt = 1_700_000_000_000;
  const expiryFor = credentialUpdatedAt => createProvider([{
    id: 'wx-1',
    platform: 'wx',
    loginBuffer: `buffer-${credentialUpdatedAt}`,
    credentialUpdatedAt,
    createdAt,
  }]).getAccounts().accounts[0].credentialExpireAt;

  assert.equal(expiryFor(createdAt), expiryFor(createdAt + 90 * 60 * 1000));
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

test('accounts without a WeChat credential or valid creation time have no expiry estimate', () => {
  const accounts = [
    { id: 'no-credential', platform: 'wx', createdAt: 1_700_000_000_000 },
    { id: 'no-created-at', platform: 'wx', loginBuffer: 'buffer', credentialUpdatedAt: 1_700_000_000_000 },
    { id: 'qq', platform: 'qq', loginBuffer: 'unrelated', createdAt: 1_700_000_000_000 },
  ];

  const listed = createProvider(accounts).getAccounts().accounts;

  assert.deepEqual(listed.map(account => account.credentialExpireAt), [0, 0, 0]);
  assert.deepEqual(listed.map(account => account.hasWxCredential), [false, true, false]);
});
