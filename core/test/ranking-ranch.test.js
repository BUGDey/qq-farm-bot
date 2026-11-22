const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { registerRankingRoute } = require('../src/controllers/admin-current-user-routes');

function fixture(files) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranking-ranch-'));
  const statsDir = path.join(dataDir, 'stats');
  fs.mkdirSync(statsDir, { recursive: true });
  for (const [name, payload] of Object.entries(files)) {
    fs.writeFileSync(path.join(statsDir, name), JSON.stringify(payload));
  }
  const routes = {};
  const app = { get: (route, ...handlers) => { routes[`get ${route}`] = handlers[handlers.length - 1]; } };
  const accounts = [
    { id: 'a1', name: '一号牧场', avatar: 'a1.png', platform: 'qq' },
    { id: 'a2', name: '二号牧场', avatar: 'a2.png', platform: 'qq' },
  ];
  registerRankingRoute({
    app,
    requireAdminToken: (req, res, next) => next(),
    store: { getAccounts: () => ({ accounts }) },
  });
  async function invoke(query) {
    const req = { query };
    const res = {
      statusCode: 200,
      status(value) { this.statusCode = value; return this; },
      json(value) { this.body = value; return this; },
    };
    await routes['get /api/ranking'](req, res);
    return res;
  }
  return { invoke, dataDir };
}

test('ranch ranking sums only whitelisted successful operations and skips unknown accounts', async () => {
  const previous = process.env.FARM_DATA_DIR;
  const f = fixture({
    'ranch-a1.json': {
      totalOperations: { steal: 2, collect: 5, harvest: 3, sell: 4, claimTask: 1, unresolvedRpc: 99 },
      savedAt: 1700000000000,
    },
    'ranch-a2.json': {
      totalOperations: { steal: 9, collect: 1, produce: 2 },
      savedAt: 1700000001000,
    },
    'ranch-ghost.json': { totalOperations: { steal: 1000 }, savedAt: 1700000002000 },
    '_identities.json': { a1: 'legacy' },
  });
  process.env.FARM_DATA_DIR = f.dataDir;
  try {
    const earn = await f.invoke({ space: 'ranch', period: 'total', type: 'earn' });
    assert.equal(earn.statusCode, 200);
    assert.equal(earn.body.data.available, true);
    assert.deepEqual(earn.body.data.list.map(row => row.accountId), ['a1', 'a2']);
    const first = earn.body.data.list[0];
    assert.equal(first.earn, 13, 'collect+harvest+sell+claimTask 才计入，未知动作不计');
    assert.equal(first.steal, 2);
    assert.equal(first.name, '一号牧场');

    const steal = await f.invoke({ space: 'ranch', period: 'total', type: 'steal' });
    assert.deepEqual(steal.body.data.list.map(row => row.accountId), ['a2', 'a1']);
  } finally {
    if (previous === undefined) delete process.env.FARM_DATA_DIR;
    else process.env.FARM_DATA_DIR = previous;
    fs.rmSync(f.dataDir, { recursive: true, force: true });
  }
});

test('ranch ranking only exposes the total period and says why other periods are missing', async () => {
  const previous = process.env.FARM_DATA_DIR;
  const f = fixture({ 'ranch-a1.json': { totalOperations: { collect: 1 } } });
  process.env.FARM_DATA_DIR = f.dataDir;
  try {
    const daily = await f.invoke({ space: 'ranch', period: 'daily', type: 'earn' });
    assert.equal(daily.statusCode, 200);
    assert.equal(daily.body.data.available, false);
    assert.deepEqual(daily.body.data.list, []);
    assert.match(daily.body.data.reason, /总历史/);

    const unknown = await f.invoke({ space: 'ranch', period: 'total', type: 'earn', space2: 'x' });
    assert.equal(unknown.body.data.available, true);
  } finally {
    if (previous === undefined) delete process.env.FARM_DATA_DIR;
    else process.env.FARM_DATA_DIR = previous;
    fs.rmSync(f.dataDir, { recursive: true, force: true });
  }
});

test('farm ranking still ignores ranch stats files and keeps its own periods', async () => {
  const previous = process.env.FARM_DATA_DIR;
  const f = fixture({
    'ranch-a1.json': { totalOperations: { steal: 5 } },
    'a1.json': { rank: { daily: { steal: 3, earn: 7 }, total: { steal: 30, earn: 70 } } },
  });
  process.env.FARM_DATA_DIR = f.dataDir;
  try {
    const daily = await f.invoke({ space: 'farm', period: 'daily', type: 'earn' });
    assert.equal(daily.statusCode, 200);
    assert.equal(daily.body.data.available, true);
    assert.deepEqual(daily.body.data.list.map(row => row.accountId), ['a1']);
    assert.equal(daily.body.data.list[0].earn, 7);
  } finally {
    if (previous === undefined) delete process.env.FARM_DATA_DIR;
    else process.env.FARM_DATA_DIR = previous;
    fs.rmSync(f.dataDir, { recursive: true, force: true });
  }
});

test('unsupported ranking scene is rejected', async () => {
  const f = fixture({});
  const res = await f.invoke({ space: 'unknown' });
  assert.equal(res.statusCode, 400);
  fs.rmSync(f.dataDir, { recursive: true, force: true });
});