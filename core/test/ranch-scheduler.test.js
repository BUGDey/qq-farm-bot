const test = require('node:test');
const assert = require('node:assert/strict');
const { createRanchScheduler, inGroup } = require('../src/services/ranch-scheduler');

test('ranch/help/steal queues execute on independent real deadlines', async () => {
    let now = 100000;
    const scheduler = createRanchScheduler({ now: () => now, random: () => 0 });
    const settings = () => ({ autoCollect: true, autoHelp: true, autoSteal: true });
    const policy = () => ({ farmMin: 2, farmMax: 5, helpMin: 10, helpMax: 15 });
    const calls = [];
    const tick = () => scheduler.tick({ settings, policy, stealDelay: () => 60000, run: async key => { calls.push(key); } });
    await tick();
    assert.deepEqual(calls, ['farm', 'help', 'steal']);
    const state = scheduler.status(settings(), policy());
    assert.equal(state.farm.nextAt, now + 2000);
    assert.equal(state.help.nextAt, now + 10000);
    assert.equal(state.steal.nextAt, now + 60000);
    calls.length = 0;
    now += 2000;
    await tick();
    assert.deepEqual(calls, ['farm']);
    calls.length = 0;
    now += 8000;
    await tick();
    assert.deepEqual(calls, ['farm', 'help']);
});

test('disable, interval change, overlap and offline are enforced by the scheduler', async () => {
    let now = 100000;
    let enabled = true;
    let min = 2;
    let finish;
    const scheduler = createRanchScheduler({ now: () => now, random: () => 1 - Number.EPSILON });
    const settings = () => ({ autoCollect: enabled });
    const policy = () => ({ farmMin: min, farmMax: 5 });
    let count = 0;
    const task = scheduler.tick({ settings, policy, run: () => new Promise(resolve => { count++; finish = resolve; }) });
    await scheduler.tick({ settings, policy, run: async () => { count++; } });
    assert.equal(count, 1);
    enabled = false;
    finish();
    await task;
    assert.equal(scheduler.status(settings(), policy()).farm.nextAt, 0);
    enabled = true;
    min = 4;
    await scheduler.tick({ settings, policy, ready: () => false, run: async () => { count++; } });
    assert.equal(count, 1);
    now += 1000;
    await scheduler.tick({ settings, policy, run: async () => { count++; } });
    assert.equal(scheduler.status(settings(), policy()).farm.intervalSec, 5);
    min = 5;
    assert.equal(scheduler.status(settings(), policy()).farm.nextAt, now);
});

test('task groups do not leak own-ranch actions into friend checks', () => {
    for (const key of ['autoCollect', 'autoClean', 'autoProduce', 'autoHarvest', 'autoFeedAnimal', 'autoPlace', 'autoSell', 'autoSubmitOrders']) {
        assert.equal(inGroup(key, 'farm'), true);
        assert.equal(inGroup(key, 'help'), false);
        assert.equal(inGroup(key, 'steal'), false);
    }
    assert.equal(inGroup('autoSteal', 'steal'), true);
    for (const key of ['autoHelp', 'autoStroke', 'autoPutHazard']) assert.equal(inGroup(key, 'help'), true);
});

test('one failed queue does not prevent the other queues from executing', async () => {
    const scheduler = createRanchScheduler();
    const calls = [];
    await assert.rejects(scheduler.tick({ settings: () => ({ autoCollect: true, autoHelp: true, autoSteal: true }), policy: () => ({}), run: async key => { calls.push(key); if (key === 'farm') throw Error('fixture failure'); } }), /fixture failure/);
    assert.deepEqual(calls, ['farm', 'help', 'steal']);
});

test('due groups run strictly serially and reentrant ticks cannot submit another run', async () => {
    const s = createRanchScheduler();
    let release;
    let active = 0;
    let peak = 0;
    const calls = [];
    const options = { settings: () => ({ autoCollect: true, autoHelp: true, autoSteal: true }), policy: () => ({}), run: async key => {
        active++;
        peak = Math.max(peak, active);
        calls.push(key);
        await new Promise(resolve => { release = resolve; });
        active--;
    } };
    const first = s.tick(options);
    for (const key of ['farm', 'help', 'steal']) {
        assert.equal(calls.at(-1), key);
        assert.equal(calls.length, ['farm', 'help', 'steal'].indexOf(key) + 1);
        const state = s.status(options.settings(), options.policy());
        assert.deepEqual(Object.keys(state).filter(name => state[name].running), [key]);
        await s.tick(options);
        assert.equal(active, 1);
        release();
        // Let the awaited run settle and the next group acquire the scheduler.
        await new Promise(resolve => setImmediate(resolve));
    }
    await first;
    assert.deepEqual(calls, ['farm', 'help', 'steal']);
    assert.equal(peak, 1);
    assert.equal(active, 0);
});

test('yield/defer remain due, errors back off, deadlines can wake early', async () => {
    const s = createRanchScheduler({ now: () => 10000 });
    const settings = () => ({ autoCollect: true });
    const policy = () => ({ farmMin: 60, farmMax: 60 });
    for (const status of ['yielded', 'deferred']) {
        await s.tick({ settings, policy, run: async () => ({ status }) });
        assert.equal(s.status(settings(), policy()).farm.nextAt, 10000);
    }
    await s.tick({ settings, policy, run: async () => ({ status: 'completed', nextAt: 12000 }) });
    assert.equal(s.status(settings(), policy()).farm.nextAt, 12000);
});

test('reset blocks new ticks until the old run settles and discards the remaining old groups', async () => {
    const s = createRanchScheduler({ now: () => 10000 });
    let release;
    const calls = [];
    const settings = () => ({ autoCollect: true, autoHelp: true, autoSteal: true });
    const policy = () => ({});
    const job = s.tick({ settings, policy, run: key => { calls.push(`old:${key}`); return new Promise(r => { release = r; }); } });
    s.reset();
    const newOptions = { settings, policy, run: async key => { calls.push(`new:${key}`); } };
    await s.tick(newOptions);
    assert.deepEqual(calls, ['old:farm']);
    release(); await job;
    const state = s.status(settings(), policy());
    assert.equal(state.farm.nextAt, 10000);
    assert.equal(state.farm.running, false);
    assert.deepEqual(calls, ['old:farm']);
    await s.tick(newOptions);
    assert.deepEqual(calls, ['old:farm', 'new:farm', 'new:help', 'new:steal']);
});

test('failures are aggregated after later groups settle and the next tick recovers', async () => {
    let now = 10000;
    const s = createRanchScheduler({ now: () => now });
    const settings = () => ({ autoCollect: true, autoHelp: true, autoSteal: true });
    const policy = () => ({ farmMin: 1, farmMax: 1, helpMin: 1, helpMax: 1 });
    const calls = [];
    const farmError = Error('farm failed');
    const helpError = Error('help failed');
    await assert.rejects(s.tick({ settings, policy, stealDelay: () => 1000, run: key => {
        calls.push(key);
        if (key === 'farm') throw farmError;
        if (key === 'help') return Promise.reject(helpError);
    } }), err => {
        assert.ok(err instanceof AggregateError);
        assert.deepEqual(err.errors, [farmError, helpError]);
        return true;
    });
    assert.deepEqual(calls, ['farm', 'help', 'steal']);
    const state = s.status(settings(), policy());
    assert.equal(state.farm.nextAt, 15000);
    assert.equal(state.help.nextAt, 15000);
    assert.ok(Object.values(state).every(queue => !queue.running));
    now = 15000;
    await s.tick({ settings, policy, run: async key => { calls.push(key); } });
    assert.deepEqual(calls, ['farm', 'help', 'steal', 'farm', 'help', 'steal']);
});

test('later groups recheck enablement and readiness after the preceding run', async () => {
    for (const stop of ['disable', 'offline']) {
        const s = createRanchScheduler({ now: () => 10000 });
        let enabled = true;
        let online = true;
        let release;
        const calls = [];
        const settings = () => ({ autoCollect: true, autoHelp: enabled, autoSteal: enabled });
        const options = { settings, policy: () => ({}), ready: () => online, run: async key => {
            calls.push(key);
            if (key === 'farm') await new Promise(resolve => { release = resolve; });
        } };
        const job = s.tick(options);
        if (stop === 'disable') enabled = false;
        else online = false;
        release(); await job;
        assert.deepEqual(calls, ['farm'], stop);
        enabled = true;
        online = true;
        await s.tick(options);
        assert.deepEqual(calls, ['farm', 'help', 'steal'], stop);
    }
});

test('cancelled runs stop the current tick and remain due for a later tick', async () => {
    for (const cancellation of [{ cancelled: true }, { status: 'cancelled' }]) {
        const s = createRanchScheduler({ now: () => 10000 });
        const calls = [];
        const settings = () => ({ autoCollect: true, autoHelp: true, autoSteal: true });
        const policy = () => ({});
        await s.tick({ settings, policy, run: async key => { calls.push(key); return cancellation; } });
        assert.deepEqual(calls, ['farm']);
        assert.equal(s.status(settings(), policy()).farm.nextAt, 10000);
        await s.tick({ settings, policy, run: async key => { calls.push(key); } });
        assert.deepEqual(calls, ['farm', 'farm', 'help', 'steal']);
    }
});
