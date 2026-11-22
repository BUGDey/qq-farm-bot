const test = require('node:test');
const assert = require('node:assert/strict');
const { createRanchService } = require('../src/services/ranch');
const { createRanchSession } = require('../src/services/ranch-session');

function fixture() {
    const session = createRanchSession({ minDwellMs: 0 });
    const automation = {};
    const entries = [], calls = [];
    session.adoptScene('farm');
    session.configure({ transition: async scene => { entries.push(scene); } });
    const service = createRanchService({
        session, getSettings: () => automation, getUserState: () => ({ gid: '123' }),
        rpc: (method, params) => session.run('fixture.RanchService', method, async () => {
            calls.push({ method, params });
            if (method === 'AllCells') return { facilities: [] };
            return {};
        }),
    });
    return { service, session, automation, entries, calls };
}

test('disabled ranch automation never queues a lease or switches scenes, including preference-only settings', async () => {
    for (const preferences of [{}, { ranch_auto_stroke_selected: true }, { ranch_auto_exchange_priority: true }, { ranch_auto_stroke_selected: true, ranch_auto_exchange_priority: true }]) {
        const f = fixture();
        Object.assign(f.automation, preferences);
        let leases = 0;
        const enter = f.session.inRanch;
        f.session.inRanch = (...args) => { leases++; return enter(...args); };
        await f.service.tickAutomation();
        for (const group of ['all', 'farm', 'help', 'steal']) await f.service.runAutomation(group);
        assert.equal(leases, 0);
        assert.deepEqual(f.entries, []);
        assert.deepEqual(f.calls, []);
        assert.equal(f.session.snapshot().scene, 'farm');
        assert.ok(Object.values(f.service.getAutomationSchedule()).every(q => !q.enabled && q.nextAt === 0));
    }
});

test('turning off queued automation prevents scene transition and RPCs', async () => {
    const f = fixture();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const farm = f.session.inFarm(() => gate);
    f.automation.ranch_auto_collect = true;
    const patrol = f.service.tickAutomation();
    assert.equal(f.session.snapshot().queued, 1);
    f.automation.ranch_auto_collect = false;
    f.automation.ranch_auto_exchange_priority = true;
    release();
    await Promise.all([farm, patrol]);
    assert.deepEqual(f.entries, []);
    assert.deepEqual(f.calls, []);
    assert.equal(f.session.snapshot().scene, 'farm');
});

test('enabling a real action resumes patrols, and disabling it stops further automatic transitions', async () => {
    const f = fixture();
    await f.service.tickAutomation();
    f.automation.ranch_auto_collect = true;
    await f.service.tickAutomation();
    assert.deepEqual(f.entries, ['ranch']);
    assert.ok(f.calls.some(c => c.method === 'AllCells'));
    f.automation.ranch_auto_collect = false;
    f.session.adoptScene('farm');
    f.calls.length = 0;
    await f.service.tickAutomation();
    assert.deepEqual(f.entries, ['ranch']);
    assert.deepEqual(f.calls, []);
});

test('manual ranch status remains available with all automation disabled', async () => {
    const f = fixture();
    const state = await f.service.getStatus();
    assert.equal(state.sceneReady, true);
    assert.deepEqual(f.entries, ['ranch']);
    assert.ok(f.calls.some(c => c.method === 'AllCells'));
});
