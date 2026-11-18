'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRanchProtocol, HARVEST_RANCH_OP } = require('../src/services/ranch-protocol');
const fixtures = require('./fixtures/ranch-official-codecs.json');

for (const fixture of fixtures) {
    test(`ranch official encoder fixture: ${fixture.method} ${fixture.direction}`, () => {
        const protocol = createRanchProtocol();
        const descriptor = protocol.rpc[fixture.method];
        const type = fixture.direction === 'request' ? descriptor.requestType : descriptor.responseType;
        const options = { longs: String, defaults: true };
        const official = type.toObject(type.decode(Buffer.from(fixture.hex, 'hex')), options);
        const expected = type.toObject(type.decode(type.encode(type.fromObject(fixture.params)).finish()), options);
        assert.deepEqual(official, expected);
        if (fixture.direction === 'request') {
            assert.deepEqual(type.toObject(type.decode(protocol.encode(fixture.method, fixture.params)), options), official);
        } else {
            assert.deepEqual(protocol.decode(fixture.method, Buffer.from(fixture.hex, 'hex')), official);
        }
    });
}

test('ranch service routing matches official generated clients', () => {
    const { rpc } = createRanchProtocol();
    assert.equal(rpc.GetRanchDetail.service, 'gamepb.animalpb.AnimalService');
    assert.equal(rpc.HarvestRanch.service, 'gamepb.animalpb.AnimalService');
    assert.equal(rpc.CleanRanch.service, 'gamepb.animalpb.RanchService');
    assert.equal(rpc.CleanAllRanch.service, 'gamepb.animalpb.RanchService');
});

test('ranch scene request and shelves-only harvest wire contract', () => {
    const protocol = createRanchProtocol();
    assert.equal(protocol.encode('PlayerSceneLogin', { global_scene_id: 2 }).toString('hex'), '0802');
    assert.equal(protocol.encode('HarvestRanch', { ranch_inst_ids: [100], op: HARVEST_RANCH_OP.SHELVES }).toString('hex'), '1201641802');
    assert.notEqual(HARVEST_RANCH_OP.SHELVES, HARVEST_RANCH_OP.ALL);
    assert.notEqual(HARVEST_RANCH_OP.SHELVES, HARVEST_RANCH_OP.ANIMALS);
    assert.throws(() => protocol.encode('SetDefaultScene', {}), /Unsupported ranch RPC/);
});

test('ranch uint64/int64 response values retain exact precision', () => {
    const protocol = createRanchProtocol();
    const type = protocol.rpc.GetRanchDetail.responseType;
    const bytes = type.encode(type.fromObject({ ranches: [{ ranch_inst_id: '9007199254740993' }] })).finish();
    assert.equal(protocol.decode('GetRanchDetail', bytes).ranches[0].ranch_inst_id, '9007199254740993');
});

test('ranch expanded actions use official service ownership and enums', () => {
    const { rpc } = createRanchProtocol();
    const { ANIMAL_STAGE, ANIMAL_STAGE_LABELS, BUCKET_TYPE, MAIN_CITY_ENTRY_TYPE } = require('../src/services/ranch-protocol');
    for (const method of ['PlaceAnimal', 'TriggerProduce', 'FeedAnimal']) assert.equal(rpc[method].service, 'gamepb.animalpb.AnimalService');
    for (const method of ['UpgradeBuilding', 'CompleteBuildingUpgrade']) assert.equal(rpc[method].service, 'gamepb.homesteadpb.HomesteadService');
    assert.equal(rpc.AddFeed.service, 'gamepb.homesteadpb.FeedMachineService');
    assert.equal(rpc.BuyBuilding.service, 'gamepb.homesteadpb.MainCityService');
    assert.equal(ANIMAL_STAGE.GAIN, 5);
    assert.equal(ANIMAL_STAGE_LABELS[ANIMAL_STAGE.GAIN], '可收获');
    assert.equal(BUCKET_TYPE.ORGANIC, 1);
    assert.equal(MAIN_CITY_ENTRY_TYPE.UI, 2);
});

test('HAR-confirmed ranch friend, illustrated and exchange request fields', () => {
    const protocol = createRanchProtocol();
    const { ILLUSTRATED_TYPE, RANCH_SHOP_ID } = require('../src/services/ranch-protocol');
    assert.equal(ILLUSTRATED_TYPE.RANCH, 101);
    assert.equal(RANCH_SHOP_ID.EXCHANGE, 7);
    assert.equal(protocol.encode('GetIllustratedListV2', { rarity: 0, type: 101 }).toString('hex'), '08001065');
    assert.equal(protocol.encode('RotationShopInfo', { shop_id: 7 }).toString('hex'), '0807');
    assert.equal(protocol.encode('GetGameFriends', { global_scene_id: 2 }).toString('hex'), '1002');
    assert.equal(protocol.rpc.GetGameFriends.service, 'gamepb.friendpb.FriendService');
    assert.equal(protocol.rpc.RotationShopInfo.service, 'gamepb.shoppb.ShopService');
});
