const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getAnimalVisual, getFacilityVisual } = require('../src/services/ranch-visuals');
const config = require('../src/gameConfig/RanchConfig.json');
const manifest = require('../src/gameConfig/ranch_visuals/manifest.json');
const sources = require('../src/gameConfig/ranch_visuals/sources.json');

test('all configured animals have distinct official cub, growing and adult poses', () => {
    for (const animal of config.MCAnimalConfig) {
        const images = [1, 2, 3].map(stage => getAnimalVisual(animal.id, stage).image);
        assert.equal(new Set(images).size, 3, animal.name);
        assert.ok(images.every(Boolean), animal.name);
        assert.equal(getAnimalVisual(animal.id, 4).image, images[2]);
        assert.equal(getAnimalVisual(animal.id, 5).image, images[2]);
    }
    const id = config.MCAnimalConfig[0].id;
    assert.equal(getAnimalVisual(id, 3, { mutationType: 1, tier: 4 }).pose, 4);
    assert.equal(getAnimalVisual(id, 3, { mutationType: 1, tier: 3 }).pose, 3);
    assert.equal(getAnimalVisual(id, 1, null).pose, 1);
    assert.equal(getAnimalVisual('unknown', 1).image, '');
    assert.equal(getAnimalVisual(60001, 99).image, '');
});

test('placed facility scenes use official prefab layers, not inventory icons', () => {
    for (const facility of config.MCFacilityConfig) {
        const scene = getFacilityVisual(facility);
        assert.ok(scene?.layers.length, facility.name);
        for (const layer of scene.layers) {
            assert.ok(layer.width > 0 && layer.height > 0);
            assert.ok(layer.image.startsWith('/game-config/ranch_visuals/facilities/'));
        }
    }
    const layers = manifest.facilities['unit/prefab/buildings/Pasture-Coop'].layers;
    assert.ok(layers.some(layer => layer.front));
    assert.ok(layers.some(layer => !layer.front));
});

test('every extracted visual has a local PNG and verified SHA256 provenance', () => {
    const root = path.resolve(__dirname, '../src/gameConfig/ranch_visuals');
    for (const item of sources.files) {
        const bytes = fs.readFileSync(path.join(root, item.file));
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', item.file);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, item.file);
    }
    assert.equal(sources.files.length, 126);
});


test('normalized ranch snapshots carry facility layers and current animal stage images', () => {
    const { normalizeSnapshot } = require('../src/services/ranch');
    const facility = config.MCFacilityConfig.find(row => row.prefab_path.endsWith('Pasture-Coop'));
    const animal = config.MCAnimalConfig[0];
    const state = normalizeSnapshot({
        cells: { facilities: [{ facility_id: facility.facility_id, instance_id: '123', ranch: { ranch_inst_id: '123' } }] },
        ranches: [{ ranch_inst_id: '123', animals: [{ animal_id: animal.id, stage: 2 }] }],
        bag: {}, tabs: {}, settings: {},
    });
    assert.ok(state.facilities[0].visual.layers.length);
    assert.equal(state.ranches[0].animals[0].visual.image, getAnimalVisual(animal.id, 2).image);
});

test('official stage ratios and mutation scale caps are preserved', () => {
    assert.equal(getAnimalVisual(60001, 1).scale, 1 / (1.3 * 1.25));
    assert.equal(getAnimalVisual(60001, 2).scale, 0.8);
    assert.equal(getAnimalVisual(60001, 3, { scaleBp: 18000, tier: 4 }).scale, 1.5);
    assert.equal(getAnimalVisual(60001, 3, { scaleBp: 14000, tier: 1 }).scale, 1.2);
});
