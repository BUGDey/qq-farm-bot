const test = require('node:test');
const assert = require('node:assert/strict');
const { createRanchSession } = require('../src/services/ranch-session');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
    const events = [];
    const session = createRanchSession({ minDwellMs: 0, ...options });
    session.configure({ transition: async scene => events.push(`enter:${scene}`) });
    const rpc = (name, fn = async () => events.push(name)) => session.run('test.Service', name, fn);
    return { session, events, rpc };
}

test('whole farm/ranch batches never interleave; consecutive ranch requests reuse one scene entry', async () => {
    const { session, events, rpc } = fixture();
    let finish;
    const ranch = session.inRanch(async () => {
        await rpc('ranch:read');
        await new Promise(resolve => { finish = resolve; });
        await rpc('ranch:write');
    });
    await flush();
    const farm = session.inFarm(() => rpc('farm:harvest'));
    await flush();
    assert.deepEqual(events, ['enter:ranch', 'ranch:read']);
    finish(); await Promise.all([ranch, farm]);
    assert.deepEqual(events, ['enter:ranch', 'ranch:read', 'ranch:write', 'enter:farm', 'farm:harvest']);
    await session.inFarm(() => rpc('farm:query'));
    assert.equal(events.filter(x => x === 'enter:farm').length, 1);
});

test('parallel RPCs within one lease serialize; heartbeat bypasses a blocked batch', async () => {
    const { session, events, rpc } = fixture();
    let finish;
    const batch = session.inRanch(async () => {
        const a = rpc('first', () => new Promise(resolve => { events.push('first'); finish = resolve; }));
        const b = rpc('second');
        await Promise.all([a, b]);
    });
    await flush();
    await session.run('gamepb.userpb.UserService', 'Heartbeat', async () => events.push('heartbeat'));
    assert.deepEqual(events, ['enter:ranch', 'first', 'heartbeat']);
    finish(); await batch;
    assert.equal(events.at(-1), 'second');
});

test('ordinary ranch failure does not poison farm queue', async () => {
    const { session, rpc } = fixture();
    await assert.rejects(session.inRanch(() => rpc('fail', async () => { throw Error('ranch'); })), /ranch/);
    assert.equal(await session.inFarm(() => rpc('ok', async () => 'farm ok')), 'farm ok');
});

test('reset rejects queued and stale active work; new connection must re-enter even same scene', async () => {
    const { session, events, rpc } = fixture();
    let finish;
    const active = session.inRanch(async () => {
        await rpc('read');
        await new Promise(resolve => { finish = resolve; });
        await rpc('old-write');
    });
    const activeReject = assert.rejects(active, /重置/);
    await flush();
    const pending = session.inFarm(() => rpc('old-farm'));
    const pendingReject = assert.rejects(pending, /重置/);
    session.reset(); finish();
    await Promise.all([activeReject, pendingReject]);
    await session.inRanch(() => rpc('new-write'));
    assert.equal(events.includes('old-write'), false);
    assert.equal(events.includes('old-farm'), false);
    assert.equal(events.filter(e => e === 'enter:ranch').length, 2);
});

test('finished async context cannot send late work and mixed nested scenes fail closed', async () => {
    const { session, rpc } = fixture();
    let late;
    await session.inRanch(async () => {
        late = () => rpc('late');
        await assert.rejects(session.inFarm(() => rpc('wrong')), /嵌套/);
    });
    // Preserve the actual ALS context, not merely a function created in it.
    let resume;
    let delayed;
    await session.inRanch(async () => {
        delayed = new Promise(resolve => { resume = resolve; }).then(() => late());
    });
    const rejection = assert.rejects(delayed, /事务已结束/);
    resume(); await rejection;
});

test('scene entry failure blocks writes, backs off, and can recover', async () => {
    let time = 0;
    const { session, rpc, events } = fixture({ now: () => time });
    let attempts = 0;
    session.configure({ transition: async () => { attempts++; if (attempts === 1) throw Error('entry failed'); } });
    await assert.rejects(session.inRanch(() => rpc('write')), /entry failed/);
    await assert.rejects(session.inRanch(() => rpc('write')), /退避/);
    assert.equal(attempts, 1); assert.deepEqual(events, []);
    time = 5000;
    await session.inRanch(() => rpc('write'));
    assert.deepEqual(events, ['write']);
});

test('owner error poisons remaining writes without retry; next transaction re-enters', async () => {
    const { session, rpc, events } = fixture();
    await assert.rejects(session.inRanch(async () => {
        await assert.rejects(rpc('addFeed', async () => { throw Error('code=1045108 只有牧场主人'); }), /1045108/);
        await assert.rejects(rpc('later'), /取消/);
    }), /1045108/);
    await session.inRanch(() => rpc('fresh-read'));
    assert.deepEqual(events, ['enter:ranch', 'enter:ranch', 'fresh-read']);
});

test('failed friend exit invalidates home context; successful visit stays in same scene', async () => {
    const { session, rpc, events } = fixture();
    const visit = (method, fn = async () => {}) => session.run('gamepb.visitpb.VisitService', method, fn);
    await assert.rejects(session.inRanch(async () => {
        await visit('EnterHomestead');
        await visit('LeaveHomestead', async () => { throw Error('leave failed'); });
    }), /leave failed/);
    await session.inRanch(async () => { await visit('EnterHomestead'); await visit('LeaveHomestead'); });
    await session.inRanch(() => rpc('home'));
    assert.equal(events.filter(e => e === 'enter:ranch').length, 2);
});

test('unfinished visit is not reused as own home by next transaction', async () => {
    const { session, rpc, events } = fixture();
    await session.inRanch(() => session.run('gamepb.visitpb.VisitService', 'EnterHomestead', async () => {}));
    await session.inRanch(() => rpc('home'));
    assert.equal(events.filter(e => e === 'enter:ranch').length, 2);
});

test('duplicate pending/active automation coalesces into one transaction', async () => {
    const { session } = fixture();
    let finish, count = 0;
    const fn = async () => { count++; await new Promise(resolve => { finish = resolve; }); };
    const a = session.inFarm(fn, { key: 'patrol' });
    const b = session.inFarm(fn, { key: 'patrol' });
    assert.equal(a, b); finish(); await a; assert.equal(count, 1);
});

function clockFixture(extra = {}) {
    let time = 0;
    const timers = new Set();
    const f = fixture({ now: () => time, minDwellMs: 15000, maxWaitMs: 30000,
        setTimer: (fn, delay) => { const timer = { fn, due: time + delay }; timers.add(timer); return timer; },
        clearTimer: timer => { if (timer) timers.delete(timer); },
        ...extra });
    return { ...f, advance: async delta => {
        time += delta;
        // 队列超时与场景驻留定时器可能同时到期，逐个触发直到没有到期项。
        for (let guard = 0; guard < 10; guard++) {
            const due = [...timers].filter(timer => timer.due <= time);
            if (!due.length) break;
            for (const timer of due) { timers.delete(timer); timer.fn(); }
            await flush();
        }
        await flush();
    } };
}

test('scene dwell batches same-scene work, then yields without starving opposite scene', async () => {
    const { session, rpc, events, advance } = clockFixture();
    await session.inFarm(() => rpc('farm0'));
    const ranch = session.inRanch(() => rpc('ranch'));
    await session.inFarm(() => rpc('farm1'));
    assert.equal(events.includes('ranch'), false);
    await advance(14999); assert.equal(events.includes('ranch'), false);
    await advance(1); await ranch;
    assert.deepEqual(events, ['enter:farm', 'farm0', 'farm1', 'enter:ranch', 'ranch']);
});

test('manual operation bypasses dwell but never interrupts an active request', async () => {
    const { session, rpc, events } = clockFixture();
    let finish;
    const farm = session.inFarm(async () => {
        await rpc('start'); await new Promise(resolve => { finish = resolve; }); await rpc('end');
    });
    await flush();
    const manual = session.inRanch(() => rpc('manual'), { manual: true });
    await flush(); assert.equal(events.includes('manual'), false);
    finish(); await Promise.all([farm, manual]);
    assert.deepEqual(events, ['enter:farm', 'start', 'end', 'enter:ranch', 'manual']);
});

test('overdue automation wins over new manual work; yield signals only at safe boundaries', async () => {
    const { session, rpc, events, advance } = clockFixture();
    let finish;
    const farm = session.inFarm(async () => {
        await rpc('start'); await new Promise(resolve => { finish = resolve; });
        assert.equal(session.shouldYield(), true);
    });
    await flush();
    const ranch = session.inRanch(() => rpc('overdue'));
    await advance(30000);
    const manual = session.inFarm(() => rpc('manual'), { manual: true });
    finish(); await Promise.all([farm, ranch, manual]);
    assert.ok(events.indexOf('overdue') < events.indexOf('manual'));
});

test('kickout suspension blocks new business until login resumes', async () => {
    const { session, rpc } = fixture();
    session.reset(); session.suspend();
    assert.throws(() => session.inFarm(() => rpc('blocked')), /等待重新登录/);
    session.resume();
    await session.inFarm(() => rpc('new-login'));
});

test('reset during scene entry does not apply stale backoff to the new connection', async () => {
    const { session, rpc } = fixture();
    let fail;
    session.configure({ transition: () => new Promise((_resolve, reject) => { fail = reject; }) });
    const old = session.inRanch(() => rpc('old'));
    const rejection = assert.rejects(old, /重置/);
    await flush(); session.reset(); fail(Error('old failure')); await rejection;
    assert.equal(session.snapshot().retryAt, 0);
    session.configure({ transition: async () => {} });
    await session.inFarm(() => rpc('new'));
});

test('ACE telemetry leaves the account scene unchanged', async () => {
    const { session, rpc, events } = fixture();
    await session.inRanch(() => rpc('ranch'));
    await session.run('gamepb.acepb.AceService', 'AntiData', async () => events.push('ace'));
    await session.inRanch(() => rpc('ranch-again'));
    assert.deepEqual(events, ['enter:ranch', 'ranch', 'ace', 'ranch-again']);
});

test('ranch scene-entry backoff does not block farm recovery', async () => {
    const { session, rpc, events } = fixture({ now: () => 0 });
    session.configure({ transition: async scene => { if (scene === 'ranch') throw Error('entry failed'); events.push(`enter:${scene}`); } });
    await assert.rejects(session.inRanch(() => rpc('ranch-write')), /entry failed/);
    await session.inFarm(() => rpc('farm-read'));
    assert.deepEqual(events, ['enter:farm', 'farm-read']);
    await assert.rejects(session.inRanch(() => rpc('ranch-write')), /退避/);
    await session.inFarm(() => rpc('farm-again'));
    assert.equal(events.filter(e => e === 'enter:farm').length, 1);
});

test('1045002 preserves working farm and stops repeated ranch scene logins until reconnect', async () => {
    const { session, rpc, events } = fixture();
    let refused = 0;
    session.configure({ transition: async target => {
        if (target === 'ranch') { refused++; throw Error('code=1045002 该场景还未解锁'); }
        events.push(`enter:${target}`);
    } });
    await session.inFarm(() => rpc('farm-first'));
    for (let i = 0; i < 3; i++) await assert.rejects(session.inRanch(async () => {
        await assert.rejects(rpc('ranch-write'), /1045002/);
        await rpc('must-not-send');
    }), /1045002/);
    await session.inFarm(() => rpc('farm-last'));
    assert.equal(refused, 1);
    assert.deepEqual(events, ['enter:farm', 'farm-first', 'farm-last']);
    assert.deepEqual(session.snapshot().blockedScenes, ['ranch']);
    session.reset();
    assert.deepEqual(session.snapshot().blockedScenes, []);
});

test('ACE runs outside a blocked ranch transaction without changing scene', async () => {
    const { session, events, rpc } = fixture();
    let release;
    const batch = session.inRanch(() => rpc('blocked', () => new Promise(resolve => {
        events.push('business'); release = resolve;
    })));
    await flush();
    await session.run('gamepb.acepb.AceService', 'AntiData', async () => events.push('ace'));
    assert.deepEqual(events, ['enter:ranch', 'business', 'ace']);
    release(); await batch;
    assert.equal(session.snapshot().scene, 'ranch');
});

test('queued manual work fails with a readable timeout instead of hanging until the gateway cuts it', async () => {
    const { session, rpc, events, advance } = clockFixture({ manualQueueTimeoutMs: 5000 });
    let finish;
    const busy = session.inRanch(async () => {
        await rpc('long'); await new Promise(resolve => { finish = resolve; }); await rpc('done');
    });
    await flush();
    const manual = session.inRanch(() => rpc('manual'), { manual: true });
    const rejected = assert.rejects(manual, err => {
        assert.equal(err.code, 'SCENE_QUEUE_TIMEOUT');
        assert.match(err.message, /排队超过 5 秒/);
        assert.match(err.message, /本次操作未提交/);
        return true;
    });
    await advance(5000);
    await rejected;
    assert.equal(events.includes('manual'), false);
    finish(); await busy;
    assert.deepEqual(events, ['enter:ranch', 'long', 'done']);
});

test('an early timer wake re-arms the queue timeout instead of failing the request', async () => {
    const { session, rpc, events, advance } = clockFixture({ manualQueueTimeoutMs: 5000 });
    let finish;
    const busy = session.inRanch(async () => {
        await rpc('long'); await new Promise(resolve => { finish = resolve; });
    });
    await flush();
    const manual = session.inRanch(() => rpc('manual'), { manual: true });
    await advance(1);
    assert.equal(events.includes('manual'), false);
    const settled = await Promise.race([manual.then(() => 'resolved'), flush().then(() => 'waiting')]);
    assert.equal(settled, 'waiting');
    finish(); await Promise.all([busy, manual]);
    assert.deepEqual(events, ['enter:ranch', 'long', 'manual']);
});
