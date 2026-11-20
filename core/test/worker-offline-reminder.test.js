const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createWorkerManager } = require('../src/runtime/worker-manager');

function createHarness(t) {
  const processes = [];
  const workers = {};
  const reminders = [];
  const accountLogs = [];
  const manager = createWorkerManager({
    fork: () => {
      const proc = new EventEmitter();
      proc.sent = [];
      proc.send = msg => proc.sent.push(msg);
      proc.kill = () => {};
      processes.push(proc);
      return proc;
    },
    runtimeMode: 'fork',
    processRef: { pkg: false, env: {}, execPath: process.execPath },
    mainEntryPath: '',
    workerScriptPath: '',
    workers,
    globalLogs: [],
    log: () => {},
    addAccountLog: (...args) => accountLogs.push(args),
    normalizeStatusForPanel: value => value,
    buildConfigSnapshotForAccount: () => ({}),
    getOfflineAutoDeleteMs: () => Infinity,
    triggerOfflineReminder: params => reminders.push(params),
    addOrUpdateAccount: () => {},
    getAccounts: () => ({ accounts: [] }),
    deleteAccount: () => {}
  });
  t.after(() => manager.dispose());
  const account = { id: 'a1', name: '测试账号', username: 'owner', code: 'code' };
  manager.startWorker(account);
  return { proc: processes[0], processes, workers, reminders, accountLogs, manager, account };
}

test('WS 400 登录失效立即触发下线提醒并携带所属用户', (t) => {
  const { proc, reminders } = createHarness(t);
  proc.emit('message', { type: 'ws_error', code: 400, message: 'token expired' });

  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].username, 'owner');
  assert.match(reminders[0].reason, /^ws_400:/);
});

test('Worker 意外退出触发提醒，正常停止退出不触发', (t) => {
  const unexpected = createHarness(t);
  unexpected.proc.emit('message', { type: 'worker_fatal', origin: 'unhandledRejection', name: 'TypeError', code: 'ERR_TEST', message: 'not-for-logs' });
  unexpected.proc.emit('exit', 1, null);
  assert.equal(unexpected.reminders.length, 1);
  assert.equal(unexpected.reminders[0].reason, 'worker_exit:code=1,signal=none,cause=unhandledRejection:TypeError:ERR_TEST');
  assert.doesNotMatch(JSON.stringify(unexpected.accountLogs), /not-for-logs/);

  const normal = createHarness(t);
  normal.workers.a1.stopping = true;
  normal.proc.emit('exit', 0, null);
  assert.equal(normal.reminders.length, 0);
});

test('踢下线后 Worker 退出不会重复发送提醒', (t) => {
  const { proc, reminders } = createHarness(t);
  proc.emit('message', { type: 'account_kicked', reason: '异地登录' });
  proc.emit('exit', 0, null);

  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].username, 'owner');
  assert.equal(reminders[0].reason, 'kickout:异地登录');
});

test('旧 Worker 迟到响应、许可释放及退出不影响新一代', async (t) => {
  const { proc, processes, workers, reminders, manager, account } = createHarness(t);
  const oldRequest = manager.callWorkerApi(account.id, 'status');
  const oldRejected = assert.rejects(oldRequest, /Worker restarted/);
  const oldCall = proc.sent.at(-1);
  proc.emit('message', { type: 'task_permit_request', token: '1' });
  assert.equal(manager.getResourceStatus().governor.active, 1);

  proc.exitCode = 1;
  manager.restartWorker(account);
  await oldRejected;
  assert.equal(manager.getResourceStatus().governor.active, 0);
  const current = processes[1];
  const newRequest = manager.callWorkerApi(account.id, 'status');
  const newCall = current.sent.at(-1);
  assert.equal(oldCall.id, newCall.id);
  current.emit('message', { type: 'task_permit_request', token: '1' });
  proc.emit('message', { type: 'task_permit_release', token: '1' });
  proc.emit('message', { type: 'api_response', id: oldCall.id, result: 'stale' });
  proc.emit('exit', 1, null);

  assert.equal(workers.a1.process, current);
  assert.equal(manager.getResourceStatus().governor.active, 1);
  assert.equal(reminders.length, 0);
  current.emit('message', { type: 'api_response', id: newCall.id, result: 'current' });
  assert.equal(await newRequest, 'current');
  current.emit('message', { type: 'task_permit_release', token: '1' });
  assert.equal(manager.getResourceStatus().governor.active, 0);
});

test('worker timeout names method and deadline without retrying a write', async t => {
  const { manager, proc, workers } = createHarness(t);
  const promise = manager.callWorkerApi('a1', 'ranchAction', { token: 'not-for-logs' }, { _timeoutMs: 10 });
  await assert.rejects(promise, error => {
    assert.equal(error.code, 'WORKER_API_TIMEOUT');
    assert.equal(error.timeoutMs, 10);
    assert.match(error.message, /ranchAction.*10ms/);
    assert.doesNotMatch(error.message, /not-for-logs/);
    return true;
  });
  assert.equal(proc.sent.filter(msg => msg.type === 'api_call').length, 1);
  assert.equal(workers.a1.requests.size, 0);
});

test('worker error codes survive IPC and late replies cannot settle a different request', async t => {
  const { manager, proc } = createHarness(t);
  const promise = manager.callWorkerApi('a1', 'ranchResource');
  const id = proc.sent.at(-1).id;
  proc.emit('message', { type: 'api_response', id, error: '牧场经验缺失', errorDetails: { code: 'RANCH_PROFILE_INCOMPLETE', method: 'GetBag', scene: 'ranch' } });
  await assert.rejects(promise, { code: 'RANCH_PROFILE_INCOMPLETE', method: 'GetBag', scene: 'ranch' });
});
