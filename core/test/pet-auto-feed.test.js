const test = require('node:test');
const assert = require('node:assert');

const { pickFeedPlan, FOOD_1_DAY, FOOD_3_DAY, FOOD_5_DAY, resetPetAutoFeedState } = require('../src/services/pet-auto-feed');
const store = require('../src/models/store');

function stockOf(map) {
    return new Map(Object.entries(map).map(([id, count]) => [Number(id), count]));
}

test('宠物自动喂食：配置归一化与默认值', () => {
    const { normalizePetAutoFeed } = store._test;
    assert.strictEqual(typeof normalizePetAutoFeed, 'function');
    const def = normalizePetAutoFeed(undefined);
    assert.strictEqual(def.enabled, false);
    assert.strictEqual(def.keepDays, 10);
    const custom = normalizePetAutoFeed({ enabled: true, keepDays: 12 });
    assert.strictEqual(custom.enabled, true);
    assert.strictEqual(custom.keepDays, 12);
    // 越界收敛：0/负数回落到默认 10，超上限收到 30
    assert.strictEqual(normalizePetAutoFeed({ keepDays: 0 }).keepDays, 10);
    assert.strictEqual(normalizePetAutoFeed({ keepDays: 999 }).keepDays, 30);
});

test('宠物自动喂食：达到保持天数不喂', () => {
    const plan = pickFeedPlan({ keepDays: 10, currentDays: 10, stock: stockOf({ [FOOD_1_DAY]: 5 }) });
    assert.strictEqual(plan, null);
    const more = pickFeedPlan({ keepDays: 10, currentDays: 15, stock: stockOf({ [FOOD_1_DAY]: 5 }) });
    assert.strictEqual(more, null);
});

test('宠物自动喂食：有 1 天粮就优先用 1 天粮补齐', () => {
    const plan = pickFeedPlan({ keepDays: 10, currentDays: 3, stock: stockOf({ [FOOD_1_DAY]: 20, [FOOD_3_DAY]: 5 }) });
    assert.ok(plan);
    assert.strictEqual(plan.foodId, FOOD_1_DAY);
    assert.strictEqual(plan.count, 7);
    assert.strictEqual(plan.reason, 'feed_1d');
});

test('宠物自动喂食：没有 1 天粮时剩 7 天喂 3 天粮', () => {
    const plan = pickFeedPlan({ keepDays: 10, currentDays: 6, stock: stockOf({ [FOOD_3_DAY]: 4, [FOOD_5_DAY]: 4 }) });
    assert.ok(plan);
    assert.strictEqual(plan.foodId, FOOD_3_DAY);
    assert.strictEqual(plan.count, 2); // ceil((10-6)/3)
    assert.strictEqual(plan.reason, 'feed_3d');
    // 剩余 8 天：还没到 7 天，继续等
    assert.strictEqual(pickFeedPlan({ keepDays: 10, currentDays: 8, stock: stockOf({ [FOOD_3_DAY]: 4 }) }), null);
});

test('宠物自动喂食：没有 3 天粮时剩 5 天喂 5 天粮', () => {
    const plan = pickFeedPlan({ keepDays: 10, currentDays: 4, stock: stockOf({ [FOOD_5_DAY]: 2 }) });
    assert.ok(plan);
    assert.strictEqual(plan.foodId, FOOD_5_DAY);
    assert.strictEqual(plan.count, 2); // ceil((10-4)/5)
    assert.strictEqual(plan.reason, 'feed_5d');
    // 剩余 6 天还不到 5 天阈值
    assert.strictEqual(pickFeedPlan({ keepDays: 10, currentDays: 6, stock: stockOf({ [FOOD_5_DAY]: 2 }) }), null);
});

test('宠物自动喂食：没有任何狗粮时不喂', () => {
    assert.strictEqual(pickFeedPlan({ keepDays: 10, currentDays: 0, stock: new Map() }), null);
});

test('宠物自动喂食：单次补充数量有上限', () => {
    const plan = pickFeedPlan({ keepDays: 30, currentDays: 0, stock: stockOf({ [FOOD_1_DAY]: 999 }) });
    assert.ok(plan);
    assert.ok(plan.count <= 10);
});

test.after(() => resetPetAutoFeedState());
