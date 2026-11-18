const test = require('node:test');
const assert = require('node:assert/strict');
const { createRanchProtocol } = require('../src/services/ranch-protocol');
test('official ranch task and GetAll request tags are scene scoped on wire', () => {
    const p = createRanchProtocol();
    for (const method of ['TaskInfo', 'GetAll']) assert.equal(p.encode(method, { global_scene_id: 2 }).toString('hex'), '0802');
    const type = p.rpc.TaskInfo.responseType;
    const fixture = { task_info: { tasks: [{ id: '9007199254740999', task_type: 4, cond_type: '126', params: ['60001'], progress: '1', total_progress: '2', is_unlocked: true }] } };
    const result = p.decode('TaskInfo', type.encode(type.fromObject(fixture)).finish());
    assert.equal(result.task_info.tasks[0].id, '9007199254740999');
    assert.equal(result.task_info.tasks[0].cond_type, '126');
    assert.deepEqual(result.task_info.tasks[0].params, ['60001']);
});
test('ranch claim codecs match official encoders and preserve int64 replies', () => {
    const p = createRanchProtocol();
    assert.equal(p.encode('ClaimTaskReward', { id: '300024', do_shared: false }).toString('hex'), '08f8a7121000');
    assert.equal(p.encode('BatchClaimTaskReward', { ids: ['400003', '400001'] }).toString('hex'), '0a0683b51881b518');
    assert.deepEqual(Object.keys(p.rpc.BatchClaimTaskReward.requestType.fields), ['ids']);
    for (const method of ['ClaimTaskReward', 'BatchClaimTaskReward']) {
        const T = p.rpc[method].responseType;
        const raw = { items: [{ id: '80021', count: '5' }], compensated_items: [{ id: '1007', count: '1' }], task_info: { tasks: [{ id: '9007199254740999', task_type: 4 }] } };
        const decoded = p.decode(method, T.encode(T.fromObject(raw)).finish());
        assert.equal(decoded.task_info.tasks[0].id, '9007199254740999');
        assert.equal(decoded.compensated_items[0].count, '1');
    }
});
test('shed activation matches official request tag and recorded reply wire format', () => {
    const p = createRanchProtocol();
    assert.equal(p.encode('ActivateFacility', { instance_id: '10003' }).toString('hex'), '08934e');
    // Recorded frame 283; only facility/grid data, no account or authentication fields.
    const bytes = Buffer.from('0aa50108934e10d1aaee021807200b280f38014005480550035a7d93919bbd4b94919bbd4b95919bbd4b96919bbd4b97919bbd4ba0919bbd4ba1919bbd4ba2919bbd4ba3919bbd4ba4919bbd4bad919bbd4bae919bbd4baf919bbd4bb0919bbd4bb1919bbd4bba919bbd4bbb919bbd4bbc919bbd4bbd919bbd4bbe919bbd4bc7919bbd4bc8919bbd4bc9919bbd4bca919bbd4bcb919bbd4b6001a2010b08934e10032a0208623002', 'hex');
    const result = p.decode('ActivateFacility', bytes);
    assert.equal(result.facility.instance_id, '10003');
    assert.equal(result.facility.facility_id, 6002001);
    assert.equal(result.facility.state, 1);
    assert.equal(result.facility.ranch.husbandry_type, 2);
    assert.equal(result.facility.occupied_cell_ids.length, 25);
    const type = p.rpc.ActivateFacility.responseType;
    assert.deepEqual(p.decode('ActivateFacility', type.encode(type.fromObject(result)).finish()), result);
});
