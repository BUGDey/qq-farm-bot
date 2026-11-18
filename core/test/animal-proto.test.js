const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { createRanchProtocol } = require('../src/services/ranch-protocol');

// Historical HAR request bytes retained while migrating from the partial animalpb
// descriptor to the upstream ranchbridge descriptor. Empty packed fields may be
// omitted by a correct encoder; decode both forms instead of emitting fake targets.
const protocol = createRanchProtocol();
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
test('upstream FeedAnimal retains captured request wire bytes', () => {
    const encoded = protocol.encode('FeedAnimal', {
        targets: [{ ranch_inst_id: 10001, animal_inst_id: 4 }], bucket_type: 2,
    });
    assert.equal(encoded.toString('hex'), '0a0508914e10041002');
});
test('upstream animal reference retains captured inner wire hash', () => {
    const type = protocol.root.lookupType('ranchbridge.animal_AnimalRef');
    const encoded = type.encode(type.fromObject({ ranch_inst_id: 10001, animal_inst_id: 4 })).finish();
    assert.equal(hash(encoded), '7233aaff1ef892e8773acb8be9995b39e413f6de0ef1dcf6462a077ef3ebb71c');
});
test('upstream placement item retains captured inner wire hash', () => {
    const type = protocol.root.lookupType('ranchbridge.animal_PlaceAnimalItem');
    const encoded = type.encode(type.fromObject({ ranch_inst_id: 10001, animal_id: 60002, giant_cub_item_id: 65002 })).finish();
    assert.equal(hash(encoded), '49edbd69854280f2d188c31343c0cd859692f8f24500b64a7d35f1c8bb2914c2');
});
test('captured harvest and detail requests decode with upstream semantics', () => {
    const harvest = protocol.rpc.HarvestRanch.requestType.toObject(
        protocol.rpc.HarvestRanch.requestType.decode(Buffer.from('12001801', 'hex')), { longs: String, defaults: true });
    assert.equal(harvest.op, 1);
    assert.deepEqual(harvest.ranch_inst_ids, []);
    const detail = protocol.rpc.GetRanchDetail.requestType.toObject(
        protocol.rpc.GetRanchDetail.requestType.decode(Buffer.from('1200', 'hex')), { longs: String, defaults: true });
    assert.deepEqual(detail.ranch_inst_ids, []);
});
