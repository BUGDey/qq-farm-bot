'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const source = fs.readFileSync(path.join(__dirname, '../src/core/worker.js'), 'utf8');
const timersSource = source.slice(source.indexOf('function stopRanchAutomationTimer()'), source.indexOf('async function tickRanchAutomation()'));
const startSource = source.slice(source.indexOf('async function startBot(config)'), source.indexOf('async function stopBot()'));

function harness() {
    const timers = new Map();
    let ready;
    let ticks = 0;
    const state = {
        isRunning: false, loginReady: false, friendSyncPaused: false,
        ranchAutomationEpoch: 0, ranchAutomationRunning: false, nextRanchHealthCheckAt: 0,
        accountRunStartedAt: 0, unifiedSchedulerRunning: false,
        onWsError: null, onClientVersionUpdate: null, onDisconnectHandler: null,
        onSellGain: null, onFarmHarvested: null, onDogSkillGiftPending: null,
        CONFIG: {}, process: { env: { FARM_ACCOUNT_ID: 'test', FARM_NETWORK_MODE: 'direct' } },
        networkEvents: new EventEmitter(), resourcePolicy: { statusSyncIntervalMs: 3000 },
        workerScheduler: {
            clear: key => timers.delete(key),
            setIntervalTask: (key, delay, run, options) => timers.set(key, { delay, run, options }),
        },
        connect: (_code, callback) => { ready = callback; },
        loadProto: async () => {}, getConfigSnapshot: () => ({}), getAutomation: () => ({}),
        getBag: async () => ({}), getBagItems: () => [], getUserState: () => ({}),
        processInviteCodes: async () => {}, runStartupSequence: async () => {},
        require: name => {
            assert.equal(name, '../services/pay');
            return { getDiamondBalance: async () => 0 };
        },
        tickRanchAutomation: async () => { ticks += 1; },
    };
    for (const name of [
        'log', 'applyRuntimeConfig', 'initStatusBar', 'setStatusPlatform',
        'onReconnectFailed', 'onKickout', 'initStatsWithPersistence', 'resetSessionGains',
        'startFarmCheckLoop', 'startFriendCheckLoop', 'startUnifiedScheduler',
        'resetUnifiedSchedule', 'scheduleUnifiedNextTick', 'initTaskSystem',
        'startDailyRoutineTimer', 'startStarActivityClaimTimer', 'startMugeAutomationTimer',
        'startMysteryShopAutoBuyTimer', 'startPetAutoFeedTimer', 'syncStatus',
    ]) state[name] = () => {};
    vm.createContext(state);
    vm.runInContext(`${timersSource}\n${startSource}`, state);
    return { state, timers, ready: () => ready(), ticks: () => ticks };
}

test('delayed login starts ranch heartbeat only after the connection is ready', async () => {
    const h = harness();
    await h.state.startBot({ code: 'test', platform: 'wx' });
    assert.equal(h.state.loginReady, false);
    assert.equal(h.timers.has('ranch_automation'), false);
    await h.ready();
    const timer = h.timers.get('ranch_automation');
    assert.ok(timer, 'successful asynchronous login must register the ranch heartbeat');
    assert.equal(timer.delay, 1000);
    assert.equal(timer.options.preventOverlap, true);
    assert.equal(timer.options.scene, null);
    await timer.run();
    assert.equal(h.ticks(), 1);
});

test('disconnect pauses heartbeat and login recovery replaces rather than duplicates it', async () => {
    const h = harness();
    await h.state.startBot({ code: 'test', platform: 'wx' });
    await h.ready();
    const first = h.timers.get('ranch_automation');
    assert.ok(first);
    h.state.networkEvents.emit('disconnect');
    await first.run();
    assert.equal(h.ticks(), 0);
    await h.ready();
    const recovered = h.timers.get('ranch_automation');
    assert.ok(recovered);
    assert.notEqual(recovered, first);
    assert.equal([...h.timers.keys()].filter(key => key === 'ranch_automation').length, 1);
    await recovered.run();
    assert.equal(h.ticks(), 1);
    h.state.friendSyncPaused = true;
    await recovered.run();
    assert.equal(h.ticks(), 1);
    h.state.stopRanchAutomationTimer();
    assert.equal(h.timers.has('ranch_automation'), false);
});
