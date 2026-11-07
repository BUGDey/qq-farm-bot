const assert = require('node:assert/strict');
const test = require('node:test');

const {
  withAutomationLock,
  isAutomationBusy,
  getAutomationLockStats,
  resetAutomationLocks,
  AutomationBusyError,
} = require('../src/services/automation-lock');

test('automation lock serializes tasks for the same account', async () => {
  resetAutomationLocks();
  const order = [];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const first = withAutomationLock('task-a', async () => {
    order.push('a-start');
    await delay(30);
    order.push('a-end');
  }, { key: 'acc-1' });
  const second = withAutomationLock('task-b', async () => {
    order.push('b-start');
    order.push('b-end');
  }, { key: 'acc-1' });
  await Promise.all([first, second]);
  assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);
});

test('automation lock allows parallelism across different accounts', async () => {
  resetAutomationLocks();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const start = Date.now();
  await Promise.all([
    withAutomationLock('a', () => delay(60), { key: 'acc-a' }),
    withAutomationLock('b', () => delay(60), { key: 'acc-b' }),
  ]);
  assert.ok(Date.now() - start < 110, '不同账号的任务不应互相阻塞');
});

test('automation lock is reentrant inside the same task chain', async () => {
  resetAutomationLocks();
  const result = await withAutomationLock('outer', async () => {
    const inner = await withAutomationLock('inner', async () => 'inner-ok', { key: 'acc-r' });
    return `outer-${inner}`;
  }, { key: 'acc-r' });
  assert.equal(result, 'outer-inner-ok');
});

test('automation lock does not leak into timers scheduled inside a released task', async () => {
  resetAutomationLocks();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const events = [];
  let timerDone;

  await withAutomationLock('outer', async () => {
    timerDone = new Promise((resolve) => {
      // 这个定时器继承了 outer 的异步上下文，但触发时 outer 的锁已经释放
      setTimeout(() => {
        withAutomationLock('timer', async () => {
          events.push('timer-start');
          await delay(20);
          events.push('timer-end');
        }, { key: 'acc-leak' })
          .catch(() => events.push('timer-busy'))
          .finally(resolve);
      }, 20);
    });
  }, { key: 'acc-leak' });

  const holder = withAutomationLock('holder', async () => {
    events.push('holder-start');
    await delay(80);
    events.push('holder-end');
  }, { key: 'acc-leak' });

  await Promise.all([timerDone, holder]);
  assert.deepEqual(events, ['holder-start', 'holder-end', 'timer-start', 'timer-end'],
    '释放后的定时器必须重新排队，不能当作重入直接执行');
});

test('automation lock rejects with busy error when waiting too long', async () => {
  resetAutomationLocks();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const holder = withAutomationLock('holder', () => delay(150), { key: 'acc-busy' });
  await assert.rejects(
    withAutomationLock('waiter', () => 'never', { key: 'acc-busy', lockTimeoutMs: 30 }),
    err => err instanceof AutomationBusyError && err.errorType === 'automation_busy',
  );
  await holder;
  assert.equal(isAutomationBusy('acc-busy'), false);
});

test('automation lock releases on task error and reports stats', async () => {
  resetAutomationLocks();
  await assert.rejects(
    withAutomationLock('boom', async () => { throw new Error('boom'); }, { key: 'acc-err' }),
    /boom/,
  );
  const after = await withAutomationLock('ok', async () => 'fine', { key: 'acc-err' });
  assert.equal(after, 'fine');
  const stats = getAutomationLockStats().find(item => item.accountId === 'acc-err');
  assert.ok(stats, '应能查到该账号的锁统计');
  assert.ok(stats.totalRuns >= 2);
  assert.equal(stats.locked, false);
});
