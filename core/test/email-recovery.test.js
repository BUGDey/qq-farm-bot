const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(sendMsgAsync) {
  let now = Date.now();
  const types = new Proxy({}, { get: () => ({ create: value => value, encode: value => ({ finish: () => value }), decode: value => value }) });
  const mod = { exports: {} };
  const deps = {
    '../utils/network': { sendMsgAsync }, '../utils/proto': { types },
    '../utils/utils': { log() {}, toNum: Number }, '../config/gameConfig': { getItemById() {} },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/services/email'), 'utf8'), {
    module: mod, require: name => deps[name], Date: class extends Date {
      constructor() { super(now); }
      static now() { return now; }
    },
  });
  return { ...mod.exports, advance: ms => { now += ms; } };
}
const mail = (id, claimed = false) => ({ id, claimed, has_reward: true });
const list = (...emails) => ({ body: { emails } });

test('failed initial inbox read stays retryable, including after cooldown', async () => {
  let fail = true;
  const f = fixture(async (_, method, req) => {
    assert.equal(method, 'GetEmailList');
    if (fail && req.box_type === 2) throw new Error('temporary read failure');
    return list();
  });
  await f.checkAndClaimEmails(true);
  assert.equal(f.getEmailDailyState().doneToday, false);
  assert.equal(f.shouldRetryEmailCheck(), false);
  f.advance(300000);
  assert.equal(f.shouldRetryEmailCheck(), true);
  fail = false;
  await f.checkAndClaimEmails();
  assert.equal(f.getEmailDailyState().doneToday, true);
  assert.equal(f.shouldRetryEmailCheck(), false);
});

test('lost batch response falls back only for mail still claimable after fresh read', async () => {
  let batched = false;
  const singles = [];
  const f = fixture(async (_, method, req) => {
    if (method === 'GetEmailList') return req.box_type === 2 ? list() : list(mail('a', batched), mail('b'));
    if (method === 'BatchClaimEmail') { batched = true; throw new Error('response lost'); }
    assert.equal(method, 'ClaimEmail');
    singles.push(req.email_id);
    return { body: { items: [] } };
  });
  assert.equal((await f.checkAndClaimEmails(true)).claimed, 2);
  assert.deepEqual(singles, ['b']);
});

test('failed reconciliation sends no single claims and the next round reads before writing', async () => {
  let batchCount = 0, failRefresh = true;
  const f = fixture(async (_, method, req) => {
    if (method === 'GetEmailList') {
      if (req.box_type === 2) return list();
      if (batchCount && failRefresh) throw new Error('fresh list unavailable');
      return list(mail('a', batchCount > 0));
    }
    assert.equal(method, 'BatchClaimEmail');
    batchCount++;
    return { body: { items: [] } };
  });
  await f.checkAndClaimEmails(true);
  assert.equal(f.getEmailDailyState().doneToday, false);
  failRefresh = false;
  f.advance(300000);
  await f.checkAndClaimEmails();
  assert.equal(batchCount, 1);
  assert.equal(f.getEmailDailyState().doneToday, true);
});
