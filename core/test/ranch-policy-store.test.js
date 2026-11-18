const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-farm-ranch-policy-'));
process.env.FARM_DATA_DIR = dataDir;
const oldFields = ['ranchCheckIntervalMinutes', 'ranchFeedCount', 'ranchAddFeedCount', 'ranchMaxActions', 'ranchAutoStrategy'];
const oldSwitches = ['ranch_enabled', 'ranch_produce', 'ranch_clean', 'ranch_harvest', 'ranch_feed', 'ranch_add_feed'];
fs.writeFileSync(path.join(dataDir, 'store.json'), JSON.stringify({
  accountConfigs: {
    legacy: {
      automation: { ...Object.fromEntries(oldSwitches.map(key => [key, true])), friend_auto_accept: false, sell_fruit_excludes: ['123'] },
      ...Object.fromEntries(oldFields.map(key => [key, 99])),
      friendBlacklist: [10001],
    },
  },
}));
const store = require('../src/models/store');
const { SETTINGS_KEYS, normalizePolicy } = require('../src/services/ranch-settings');

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('legacy settings cannot opt into the new ranch switches and farm customization survives', () => {
  const snapshot = store.getConfigSnapshot('legacy');
  for (const key of oldFields) assert.equal(Object.hasOwn(snapshot, key), false, key);
  for (const key of oldSwitches) assert.equal(Object.hasOwn(snapshot.automation, key), false, key);
  for (const key of Object.values(SETTINGS_KEYS)) assert.equal(snapshot.automation[key], false, key);
  assert.deepEqual(snapshot.automation.ranch_policy, normalizePolicy());
  assert.deepEqual(snapshot.friendBlacklist, [10001]);
  assert.deepEqual(snapshot.automation.sell_fruit_excludes, [123]);
  assert.equal(snapshot.automation.friend_auto_accept, false);
  for (const name of ['getRanchCheckIntervalMinutes', 'getRanchFeedCount', 'getRanchAddFeedCount', 'getRanchMaxActions', 'getRanchAutoStrategy']) {
    assert.equal(Object.hasOwn(store, name), false, name);
  }
});

test('policy normalization stays object-valued and nested data is isolated across accounts and getters', () => {
  const policy = { farmMin: 9, farmMax: 3, maxActionsPerRun: 0, friendIncludeGids: ['1'], buyRules: [{ goodsId: '1', targetStock: 10, maxPerRun: 2, maxUnitPrice: 100 }] };
  store.setAutomation('ranch_policy', policy, 'one');
  store.setAutomation('ranch_auto_collect', true, 'one');
  store.setAutomation('ranch_auto_clean', 'true', 'one');
  const expected = normalizePolicy(policy);
  const auto = store.getAutomation('one');
  assert.deepEqual(auto.ranch_policy, expected);
  assert.equal(auto.ranch_auto_collect, true);
  assert.equal(auto.ranch_auto_clean, false);
  policy.farmMin = 100;
  policy.friendIncludeGids.push('111');
  auto.ranch_policy.friendIncludeGids.push('222');
  if (auto.ranch_policy.buyRules.length) auto.ranch_policy.buyRules[0].targetStock = 999;
  auto.ranch_policy.buyRules.push({ targetStock: 999 });
  for (const value of [store.getConfigSnapshot('one'), { automation: store.getAutomation('one') }]) {
    assert.deepEqual(value.automation.ranch_policy, expected);
    value.automation.ranch_policy.canItemIds.push('333');
  }
  assert.deepEqual(store.getAutomation('one').ranch_policy, expected);
  assert.deepEqual(store.getAutomation('two').ranch_policy, normalizePolicy());
  store.applyConfigSnapshot({ automation: { ranch_policy: true, ranch_enabled: true } }, { accountId: 'two' });
  assert.deepEqual(store.getAutomation('two').ranch_policy, normalizePolicy());
  assert.equal(Object.hasOwn(store.getAutomation('two'), 'ranch_enabled'), false);
});

test('default plans preserve policy and account inheritance without sharing nested arrays', () => {
  const input = { farmMin: 12, farmMax: 15, feedTargetCount: 432 };
  const plan = store.setUserDefaultAccountPlan('ranch-user', { automation: { ranch_policy: input, ranch_auto_feed_animal: true } });
  plan.config.automation.ranch_policy.sellItemIds.push('444');
  const account = store.addOrUpdateAccount({ username: 'ranch-user', name: 'ranch', code: 'test-code' }).accounts.at(-1);
  const inherited = store.getConfigSnapshot(account.id);
  assert.deepEqual(inherited.automation.ranch_policy, normalizePolicy(input));
  assert.equal(inherited.automation.ranch_auto_feed_animal, true);
  inherited.automation.ranch_policy.cubItemIds.push('555');
  assert.deepEqual(store.getUserDefaultAccountPlan('ranch-user').config.automation.ranch_policy, normalizePolicy(input));
  const defaults = store.getDefaultAccountConfig();
  defaults.automation.ranch_policy.canItemIds.push('666');
  assert.deepEqual(store.getDefaultAccountConfig().automation.ranch_policy, normalizePolicy());
});

test('saved policy survives a fresh process and old scalar fields are absent on disk', () => {
  const expected = store.getAutomation('one').ranch_policy;
  const disk = JSON.parse(fs.readFileSync(path.join(dataDir, 'store.json'), 'utf8'));
  assert.deepEqual(disk.accountConfigs.one.automation.ranch_policy, expected);
  for (const key of oldFields) assert.equal(Object.hasOwn(disk.accountConfigs.legacy, key), false, key);
  const modulePath = require.resolve('../src/models/store');
  const child = spawnSync(process.execPath, ['-e', `const s=require(${JSON.stringify(modulePath)}); process.stdout.write(JSON.stringify(s.getAutomation('one')))`], {
    env: { ...process.env, FARM_DATA_DIR: dataDir }, encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr);
  const reloaded = JSON.parse(child.stdout);
  assert.deepEqual(reloaded.ranch_policy, expected);
  assert.equal(reloaded.ranch_auto_collect, true);
});
