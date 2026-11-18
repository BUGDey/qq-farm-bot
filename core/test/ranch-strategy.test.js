const test = require('node:test');
const assert = require('node:assert/strict');
const { createRanchMaturityPlan, feedTypes, quietNow, selectCub } = require('../src/services/ranch-strategy');
const { normalizePolicy } = require('../src/services/ranch-settings');
test('ranch maturity uses nearest producing animal, avoids empty polling, and rechecks due friends', () => {
    let now = 1800000000000;
    const plan = createRanchMaturityPlan(() => now);
    const friends = [{ gid: '123' }, { gid: '456' }];
    const s = { autoSteal: true };
    assert.equal(plan.select(friends, 5, s).length, 2);
    plan.observe('123', [{ animals: [{ producing: true, produceReadyAtMs: now + 4000 }, { producing: true, produceReadyAtMs: now + 2000 }] }]);
    plan.observe('456', [{ animals: [{ producing: false, produceReadyAtMs: now + 1000 }] }]);
    assert.equal(plan.nextDelay(s), 2000);
    assert.equal(plan.isDue(s), false);
    now += 2000;
    assert.deepEqual(plan.select(friends, 5, s), [friends[0]]);
    assert.equal(plan.isDue(s), false);
    now += 300000;
    assert.equal(plan.isDue(s), true);
    plan.reset();
    assert.equal(plan.isDue(s), true);
});
test('maturity planner is account-isolated and removes deleted friends', () => {
    const a = createRanchMaturityPlan(() => 10000); const b = createRanchMaturityPlan(() => 10000);
    a.select([{ gid: '1' }], 5, { autoSteal: true });
    assert.equal(a.isDue({ autoSteal: true }), false);
    assert.equal(b.isDue({ autoSteal: true }), true);
    a.select([], 5, { autoSteal: true });
    assert.equal(a.nextDelay({ autoSteal: true }), 900000);
});
test('help intervals operate independently from steal maturity', () => {
    let now = 10000; const plan = createRanchMaturityPlan(() => now);
    const s = { autoHelp: true, autoSteal: true }; const friends = [{ gid: '1' }];
    plan.select(friends, 5, s, { helpMin: 10, helpMax: 10 });
    assert.equal(plan.canHelp('1'), true);
    now += 5000; plan.select(friends, 5, s, { helpMin: 10, helpMax: 10 });
    assert.equal(plan.canHelp('1'), false);
    now += 5000;
    assert.equal(plan.isDue(s), true);
    plan.select(friends, 5, s, { helpMin: 10, helpMax: 10 });
    assert.equal(plan.canHelp('1'), true);
    assert.equal(plan.canSteal('1'), false);
});
test('can strategy respects time boundaries, stage limits, and no-data states', () => {
    const p = normalizePolicy({ canStrategy: 'smart_only', smartSeconds: 300 });
    const a = { canFeed: true, growReadyAtMs: 301000 };
    assert.deepEqual(feedTypes(a, p, 1000), [2]);
    assert.deepEqual(feedTypes(a, p, 999), []);
    assert.deepEqual(feedTypes({ ...a, limitedCanUsed: true }, p, 1000), []);
    assert.deepEqual(feedTypes({ canFeed: true }, p, 1000), []);
    assert.deepEqual(feedTypes({ ...a, canHarvest: true }, p, 1000), []);
});
test('quiet hours use Beijing time and handle overnight and exact boundaries', () => {
    const p = normalizePolicy({ quietEnabled: true, quietStart: '23:00', quietEnd: '07:00' });
    assert.equal(quietNow(p, Date.parse('2026-11-16T15:00:00Z')), true);
    assert.equal(quietNow(p, Date.parse('2026-11-16T22:59:59Z')), true);
    assert.equal(quietNow(p, Date.parse('2026-11-16T23:00:00Z')), false);
});
test('husbandry strategy selects from existing cubs without requiring priority lists', () => {
    assert.equal(selectCub([{ itemId: '60001' }, { itemId: '60002' }], 'level').itemId, '60002');
    assert.equal(selectCub([], 'max_exp'), undefined);
    assert.ok(selectCub([{ itemId: '60001' }], 'max_profit'));
});

test('task cub strategy prioritizes exact unfinished unlocked task targets and falls back to level', () => {
    const { selectCub } = require('../src/services/ranch-strategy');
    const rows = require('../src/gameConfig/RanchConfig.json').MCAnimalConfig.filter(a => a.enable_flag);
    const cubs = rows.map(a => ({ itemId: a.cub_item_id }));
    const highest = selectCub(cubs, 'level');
    const lower = rows.find(a => String(a.cub_item_id) !== String(highest.itemId));
    const task = { isUnlocked: true, isClaimed: false, totalProgress: '2', progress: '0', condType: '126', params: [String(lower.cub_item_id)] };
    assert.equal(selectCub(cubs, 'task', [task]).itemId, lower.cub_item_id);
    for (const patch of [{ isUnlocked: false }, { isClaimed: true }, { progress: '2' }, { params: [] }, { condType: '999' }]) {
        assert.deepEqual(selectCub(cubs, 'task', [{ ...task, ...patch }]), highest);
    }
    assert.deepEqual(selectCub(cubs, 'task', []), highest);
    assert.equal(selectCub([], 'task', [task]), undefined);
    assert.deepEqual(selectCub([highest], 'task', [task]), highest);
});

test('task husbandry policy is persisted rather than silently normalized to level', () => {
    const { normalizePolicy } = require('../src/services/ranch-settings');
    assert.equal(normalizePolicy({ mode: 'simple', husbandryStrategy: 'task' }, true).husbandryStrategy, 'task');
});

test('automatic placement reads ranch tasks for task strategy and stops on query failure', async () => {
    const { runRanchExtraAutomation } = require('../src/services/ranch-automation');
    const config = require('../src/gameConfig/RanchConfig.json');
    const animal = config.MCAnimalConfig.find(a => a.enable_flag && a.husbandry_type === '窝');
    const p = normalizePolicy({ mode: 'simple', husbandryStrategy: 'task' });
    const placed = []; const errors = [];
    let fail = false;
    const service = {
        getStatus: async () => ({ ranches: [{ ranchInstId: '1', husbandryType: 1, animalCount: 0, capacity: 3 }] }),
        getResource: async resource => {
            if (resource === 'tasks') {
                if (fail) throw new Error('task unavailable');
                return { tasks: [{ isUnlocked: true, totalProgress: '1', progress: '0', condType: '126', params: [String(animal.cub_item_id)] }] };
            }
            return { shops: [{ shopId: 5, goodsList: [{ id: '1', unlocked: true }] }] };
        },
    };
    const ctx = { service, settings: () => ({ autoPlace: true }), policy: () => p, alive: () => true, goodsMap: new Map([['1', { item_id: animal.cub_item_id, price_id: 1007 }]]), attempt: async input => placed.push(input), logError: err => errors.push(err.message) };
    await runRanchExtraAutomation(ctx);
    assert.equal(placed[0].itemId, animal.cub_item_id);
    fail = true;
    await runRanchExtraAutomation(ctx);
    assert.equal(placed.length, 1);
    assert.deepEqual(errors, ['task unavailable']);
});
