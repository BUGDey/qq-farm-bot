'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { withAutomationLock, getAutomationLockStats } = require('../src/services/automation-lock');

const workerSource = fs.readFileSync(path.join(__dirname, '../src/core/worker.js'), 'utf8');
const ranchSource = workerSource.slice(workerSource.indexOf('function stopRanchAutomationTimer()'), workerSource.indexOf('// ==================== 帮助 Tick'));
const unifiedSource = workerSource.slice(workerSource.indexOf('async function runUnifiedTick()'), workerSource.indexOf('function scheduleUnifiedNextTick()'));
const backoffSource = workerSource.slice(workerSource.indexOf('const businessBackoff ='), workerSource.indexOf('async function runFarmTick('));
const manualSource = workerSource.slice(workerSource.indexOf('const MANUAL_WRITE_METHODS ='), workerSource.indexOf('async function handleApiCallInScene('));
let accountSequence = 0;

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function harness(overrides = {}) {
    const accountId = `worker-ranch-serial-${++accountSequence}`;
    const released = [];
    const logs = [];
    let permits = 0;
    const state = {
        loginReady: true,
        friendSyncPaused: false,
        ranchAutomationRunning: false,
        ranchAutomationEpoch: 0,
        nextRanchHealthCheckAt: 0,
        getGatewayHealth: () => ({ healthy: true }),
        nextBusinessBackoffMs: previous => Math.min(120000, Math.max(30000, previous * 2)),
        unifiedSchedulerRunning: true,
        unifiedTickRunning: false,
        nextFarmRunAt: 0,
        nextHelpRunAt: Infinity,
        nextStealRunAt: Infinity,
        businessBackoffMs: 0,
        Date,
        workerScheduler: { clear() {}, setIntervalTask() {} },
        syncStatus() {},
        acquireTaskPermit: async () => ++permits,
        releaseTaskPermit: token => released.push(token),
        withAutomationLock: (name, run, options) => withAutomationLock(name, run, { ...options, accountId }),
        shouldSkipBusinessForGateway: () => false,
        getAutomation: () => ({}),
        runFarmTick: async () => {},
        runHelpTick: async () => {},
        runStealTick: async () => {},
        isTransientNetworkError: () => false,
        log: (...args) => logs.push(args),
        require: name => {
            assert.equal(name, '../services/ranch');
            return { getRanchService: () => ({ tickAutomation: () => state.ranchTask() }) };
        },
        ranchTask: async () => {},
        ...overrides,
    };
    vm.createContext(state);
    vm.runInContext(`${backoffSource}\n${ranchSource}\n${unifiedSource}`, state);
    return { state, released, logs, permits: () => permits, stats: () => getAutomationLockStats().find(entry => entry.accountId === accountId) };
}

async function flush() {
    await new Promise(resolve => setImmediate(resolve));
}

test('ranch tick waits for farm/help/steal to finish under the same account lock', async () => {
    const entered = deferred();
    const finish = deferred();
    const events = [];
    const h = harness({
        nextHelpRunAt: 0,
        nextStealRunAt: 0,
        runFarmTick: async () => { events.push('farm'); entered.resolve(); await finish.promise; },
        runHelpTick: async () => { events.push('help'); },
        runStealTick: async () => { events.push('steal'); },
        ranchTask: async () => { events.push('ranch'); },
    });
    const farm = h.state.runUnifiedTick();
    await entered.promise;
    const ranch = h.state.tickRanchAutomation();
    await flush();
    await h.state.tickRanchAutomation();
    assert.deepEqual(events, ['farm']);
    assert.equal(h.permits(), 2, 'overlapping ranch pulses must not queue more permits');
    assert.equal(h.stats().waiting, 1);
    finish.resolve();
    await Promise.all([farm, ranch]);
    assert.deepEqual(events, ['farm', 'help', 'steal', 'ranch']);
    assert.deepEqual(h.released.sort(), [1, 2]);
    assert.equal(h.stats().locked, false);
    assert.equal(h.state.ranchAutomationRunning, false);
});

test('farm tick waits until ranch service and its scene work complete', async () => {
    const entered = deferred();
    const finish = deferred();
    const events = [];
    const h = harness({
        ranchTask: async () => { events.push('ranch:scene'); entered.resolve(); await finish.promise; events.push('ranch:done'); },
        runFarmTick: async () => { events.push('farm:scene'); },
    });
    const ranch = h.state.tickRanchAutomation();
    await entered.promise;
    const farm = h.state.runUnifiedTick();
    await flush();
    assert.deepEqual(events, ['ranch:scene']);
    finish.resolve();
    await Promise.all([ranch, farm]);
    assert.deepEqual(events, ['ranch:scene', 'ranch:done', 'farm:scene']);
});

for (const changedState of [{ loginReady: false }, { friendSyncPaused: true }]) {
    test(`ranch rechecks ${Object.keys(changedState)[0]} after acquiring account lock`, async () => {
        const entered = deferred();
        const finish = deferred();
        let ranchRuns = 0;
        const h = harness({
            runFarmTick: async () => { entered.resolve(); await finish.promise; },
            ranchTask: async () => { ranchRuns += 1; },
        });
        const farm = h.state.runUnifiedTick();
        await entered.promise;
        const ranch = h.state.tickRanchAutomation();
        await flush();
        Object.assign(h.state, changedState);
        finish.resolve();
        await Promise.all([farm, ranch]);
        assert.equal(ranchRuns, 0);
        assert.equal(h.state.ranchAutomationRunning, false);
        assert.equal(h.released.length, 2);
        assert.equal(h.stats().locked, false);
    });
}

test('service failure releases ranch permit, account lock and running guard', async () => {
    let runs = 0;
    const h = harness({ ranchTask: async () => { runs += 1; throw new Error('ranch service failure'); } });
    await h.state.tickRanchAutomation();
    assert.equal(h.logs.length, 1);
    assert.equal(h.state.ranchAutomationRunning, false);
    assert.equal(h.stats().locked, false);
    assert.deepEqual(h.released, [1]);
    let farmRuns = 0;
    h.state.runFarmTick = async () => { farmRuns += 1; };
    await h.state.runUnifiedTick();
    await h.state.tickRanchAutomation();
    assert.equal(farmRuns, 1);
    assert.equal(runs, 2);
    assert.deepEqual(h.released, [1, 2, 3]);
});

test('permit rejection and lock rejection both clear overlap guard', async () => {
    const h = harness({ acquireTaskPermit: async () => { throw new Error('permit failure'); } });
    await h.state.tickRanchAutomation();
    assert.equal(h.state.ranchAutomationRunning, false);
    assert.deepEqual(h.released, []);
    h.state.acquireTaskPermit = async () => 'granted';
    h.state.withAutomationLock = async () => { throw new Error('lock failure'); };
    await h.state.tickRanchAutomation();
    assert.equal(h.state.ranchAutomationRunning, false);
    assert.deepEqual(h.released, ['granted']);
});

test('stop invalidates a ranch tick waiting for the account lock', async () => {
    const entered = deferred();
    const finish = deferred();
    let ranchRuns = 0;
    const h = harness({
        runFarmTick: async () => { entered.resolve(); await finish.promise; },
        ranchTask: async () => { ranchRuns += 1; },
    });
    const farm = h.state.runUnifiedTick();
    await entered.promise;
    const ranch = h.state.tickRanchAutomation();
    await flush();
    h.state.stopRanchAutomationTimer();
    finish.resolve();
    await Promise.all([farm, ranch]);
    assert.equal(ranchRuns, 0);
    assert.equal(h.state.ranchAutomationRunning, false);
    assert.equal(h.released.length, 2);
});

test('old tick finalizer cannot clear a new generation running guard', async () => {
    const oldPermit = deferred();
    const newPermit = deferred();
    let requests = 0;
    let ranchRuns = 0;
    const h = harness({
        acquireTaskPermit: () => (++requests === 1 ? oldPermit.promise : newPermit.promise),
        ranchTask: async () => { ranchRuns += 1; },
    });
    const oldTick = h.state.tickRanchAutomation();
    h.state.startRanchAutomationTimer();
    const newTick = h.state.tickRanchAutomation();
    oldPermit.resolve('old');
    await oldTick;
    assert.equal(ranchRuns, 0, 'invalidated tick must skip service even after permit arrives');
    assert.equal(h.state.ranchAutomationRunning, true);
    await h.state.tickRanchAutomation();
    assert.equal(requests, 2, 'old finalizer must not allow another tick to accumulate');
    newPermit.resolve('new');
    await newTick;
    assert.equal(ranchRuns, 1);
    assert.equal(h.state.ranchAutomationRunning, false);
    assert.deepEqual(h.released, ['old', 'new']);
});

test('ranch scheduler callback does not take the farm scene before the account lock', () => {
    let options;
    const h = harness({ workerScheduler: { clear() {}, setIntervalTask: (_key, _delay, _run, config) => { options = config; } } });
    h.state.startRanchAutomationTimer();
    assert.equal(options.scene, null);
    assert.equal(options.preventOverlap, true);
});

test('unhealthy ranch gateway backs off before requesting permits and recovers independently', async () => {
    let now = 1000;
    let checks = 0;
    let healthy = false;
    let runs = 0;
    const h = harness({
        Date: { now: () => now },
        getGatewayHealth: () => { checks += 1; return { healthy, reason: healthy ? '' : 'offline', pending: 3 }; },
        ranchTask: async () => { runs += 1; },
    });
    await h.state.tickRanchAutomation();
    assert.equal(h.state.nextRanchHealthCheckAt, 31000);
    assert.equal(h.permits(), 0);
    assert.equal(h.state.ranchAutomationRunning, false);
    for (now = 2000; now < 31000; now += 1000) await h.state.tickRanchAutomation();
    assert.equal(checks, 1, 'heartbeat must not repeatedly inspect the unhealthy gateway');
    await h.state.tickRanchAutomation();
    assert.equal(h.state.nextRanchHealthCheckAt, 91000);
    assert.equal(h.permits(), 0);
    assert.equal(h.logs.length, 1, 'same unhealthy reason should not spam logs');
    assert.match(h.logs[0][1], /牧场任务因网关不健康退避/);
    assert.equal(h.state.getBusinessDeferMs('farm'), 30000, 'ranch backoff must not advance farm backoff');
    healthy = true;
    now = 91000;
    await h.state.tickRanchAutomation();
    assert.equal(runs, 1);
    assert.equal(h.permits(), 1);
    assert.deepEqual(h.released, [1]);
    assert.ok(h.logs.some(entry => entry[1] === '牧场任务网关已恢复'));
    healthy = false;
    now += 1000;
    await h.state.tickRanchAutomation();
    assert.equal(h.state.nextRanchHealthCheckAt, now + 30000, 'successful health check resets ranch backoff');
});

test('restarting ranch timer resets the health-check deadline', async () => {
    const h = harness({ getGatewayHealth: () => ({ healthy: false, reason: 'offline' }) });
    await h.state.tickRanchAutomation();
    assert.ok(h.state.nextRanchHealthCheckAt > 0);
    h.state.startRanchAutomationTimer();
    assert.equal(h.state.nextRanchHealthCheckAt, 0);
});

function manualHarness(overrides = {}) {
    const events = [];
    const responses = [];
    const session = {
        detached: run => { events.push('detached'); return Promise.resolve().then(run); },
        inFarm: async (run, options) => { events.push(`farm:${options.manual}`); return run(); },
        inRanch: async (run, options) => { events.push(`ranch:${options.manual}`); return run(); },
    };
    const h = harness({
        runWithRequestPriority: async (priority, run) => { events.push(priority); return run(); },
        handleApiCallInScene: async msg => { events.push(`business:${msg.method}`); return msg.method; },
        sendToMaster: response => responses.push(response),
        classifyError: err => ({ errorType: err.errorType }),
        ...overrides,
    });
    const locked = h.state.withAutomationLock;
    h.state.withAutomationLock = (name, run, options) => locked(name, () => {
        events.push(`lock:${name}`);
        return run();
    }, options);
    h.state.require = name => {
        assert.equal(name, '../services/ranch-session');
        return { ranchSession: session };
    };
    vm.runInContext(manualSource, h.state);
    return { ...h, events, responses, session };
}

for (const [method, scene, write] of [
    ['ranchAction', 'ranch', true],
    ['ranchStatus', 'ranch', false],
    ['ranchResource', 'ranch', false],
    ['ranchConnect', 'ranch', true],
    ['sellItems', 'farm', true],
    ['getFriends', 'farm', false],
]) {
    test(`manual API ${method} enters ${scene} with manual intent and foreground priority`, async () => {
        const h = manualHarness();
        const result = await h.state.handleApiCall({ id: 1, method, args: [] });
        assert.equal(result, method);
        assert.deepEqual(h.events, [
            ...(write ? [`lock:manual.${method}`] : []),
            'detached', `${scene}:true`, 'foreground', `business:${method}`,
        ]);
        if (write) assert.equal(h.stats().locked, false);
    });
}

test('manual farm and ranch writes wait for automation before entering any scene', async () => {
    const entered = deferred();
    const finish = deferred();
    const h = manualHarness({ runFarmTick: async () => { entered.resolve(); await finish.promise; } });
    const farm = h.state.runUnifiedTick();
    await entered.promise;
    h.events.length = 0;
    const ranchWrite = h.state.handleApiCall({ id: 1, method: 'ranchAction', args: [] });
    const farmWrite = h.state.handleApiCall({ id: 2, method: 'sellItems', args: [] });
    await flush();
    assert.deepEqual(h.events, [], 'scene acquisition must follow account-lock acquisition');
    finish.resolve();
    await Promise.all([farm, ranchWrite, farmWrite]);
    assert.deepEqual(h.events, [
        'lock:manual.ranchAction', 'detached', 'ranch:true', 'foreground', 'business:ranchAction',
        'lock:manual.sellItems', 'detached', 'farm:true', 'foreground', 'business:sellItems',
    ]);
    assert.equal(h.stats().locked, false);
});

test('manual scene failure responds once and releases account lock for the next request', async () => {
    const h = manualHarness();
    h.session.inRanch = async () => { throw new Error('scene unavailable'); };
    await h.state.handleApiCall({ id: 8, method: 'ranchAction', args: [] });
    assert.equal(h.responses.length, 1);
    assert.equal(h.responses[0].id, 8);
    assert.equal(h.responses[0].error, 'scene unavailable');
    assert.equal(h.stats().locked, false);
    await h.state.handleApiCall({ id: 9, method: 'sellItems', args: [] });
    assert.equal(h.events.at(-1), 'business:sellItems');
});
