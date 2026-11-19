const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { MCAnimalConfig } = require('../src/gameConfig/RanchConfig.json');
const itemIcons = require('../src/gameConfig/RanchItemIcons.json');
const { registerAdminRanchRoutes } = require('../src/controllers/admin-ranch-routes');
const { describeRanchIllustrated } = require('../src/controllers/admin-ranch-illustrated');

const list = MCAnimalConfig.map(({ product_item: { id }, name }) => ({
    fruitId: String(id), name, image: itemIcons[id], unlocked: true,
}));

test('ranch illustrated API keeps ordinary entries and gives only 27 eligible entries a distinct giant icon', async () => {
    const routes = new Map();
    const weightScore = { totalScore: '20' };
    const book = { list, weightScore, errors: { levels: 'unavailable' } };
    registerAdminRanchRoutes({
        app: { get: (path, fn) => routes.set(path, fn), post() {} },
        provider: { getRanchResource: async (id, resource) => {
            assert.equal(id, 'mine');
            assert.equal(resource, 'illustrated');
            return book;
        } },
        getAccountIdFromRequest: () => 'mine',
        canAccessAccount: () => true,
    });
    let result;
    await routes.get('/api/ranch/illustrated')({}, { json: body => { result = body; } });
    assert.equal(result.ok, true);
    assert.equal(result.data.weightScore, weightScore);
    assert.equal(result.data.errors, book.errors);
    assert.deepEqual(result.data.list.map(({ giantItem, ...ordinary }) => ordinary), list);
    const chicken = result.data.list.find(row => row.fruitId === '2060001');
    assert.equal(chicken.giantItem, null);
    assert.equal(chicken.name, '鸡');
    assert.equal(chicken.image, '/game-config/ranch-icons/items/60001_4.png');
    assert.ok(itemIcons[2065001], 'existing giant chicken asset must not grant book eligibility');
    const giants = result.data.list.filter(row => row.giantItem);
    assert.equal(giants.length, 27);
    assert.equal(new Set(giants.map(row => row.giantItem.image)).size, 27);
    assert.deepEqual(giants.find(row => row.fruitId === '2060002').giantItem,
        { id: 2065002, name: '巨大鸭', image: '/game-config/ranch-icons/items/65002_4.png' });
    for (const { giantItem, image } of giants) {
        assert.ok(giantItem.image);
        assert.notEqual(giantItem.image, image);
        assert.ok(existsSync(resolve(__dirname, '../../web/public', `.${giantItem.image}`)));
    }
    assert.ok(list.every(row => !Object.hasOwn(row, 'giantItem')));
});

test('an image matching the normal entry is left blank without losing the giant state', () => {
    const { list: [duck] } = describeRanchIllustrated({ list: [{
        fruitId: 2060002, image: itemIcons[2065002], unlocked: false, giant: { unlocked: true, bestWeightX10: 1124 },
    }] });
    assert.equal(duck.giantItem.image, '');
    assert.equal(duck.giantItem.name, '巨大鸭');
    assert.equal(duck.unlocked, false);
    assert.equal(duck.giant.unlocked, true);
    assert.equal(duck.giant.bestWeightX10, 1124);
});
