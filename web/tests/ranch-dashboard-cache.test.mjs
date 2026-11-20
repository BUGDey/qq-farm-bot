import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

// Load the TypeScript helper without a bundler, using a fake localStorage.
const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../src/utils/ranch-dashboard-cache.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})

function createStorage() {
  const map = new Map()
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: key => { map.delete(key) },
  }
}

function loadModule(storage) {
  const module = { exports: {} }
  const sandboxRequire = id => (id === 'node:module' ? require(id) : require(id))
  const fn = new Function('require', 'module', 'exports', 'localStorage', 'Date', outputText)
  fn(sandboxRequire, module, module.exports, storage, Date)
  return module.exports
}

const profile = { name: '牧场主', level: 7, exp: '12345', levelProgress: { current: 10, needed: 100 } }
const illustrated = { currentLevel: 3, weightScore: { currentId: 2 } }
const snapshot = { items: [{ id: '1007', count: '900' }], nextChecks: { farm: { enabled: true, nextAt: 1 }, help: {}, steal: {} } }

test('cache round-trips display sections per account and never leaks across accounts', () => {
  const storage = createStorage()
  const { readRanchDashboardCache, writeRanchDashboardCache } = loadModule(storage)
  assert.equal(writeRanchDashboardCache('a1', { profile, illustrated, snapshot }), true)
  const entry = readRanchDashboardCache('a1')
  assert.equal(entry.profile.name, '牧场主')
  assert.equal(entry.illustrated.currentLevel, 3)
  assert.equal(entry.snapshot.items.length, 1)
  assert.equal(entry.snapshot.nextChecks.farm.enabled, true)
  assert.equal(readRanchDashboardCache('other'), null)
})

test('empty input is never written, so stale good data cannot be replaced by zeroes', () => {
  const storage = createStorage()
  const { readRanchDashboardCache, writeRanchDashboardCache } = loadModule(storage)
  writeRanchDashboardCache('a1', { profile })
  assert.equal(writeRanchDashboardCache('a1', { profile: null, illustrated: null, snapshot: null }), false)
  assert.equal(readRanchDashboardCache('a1').profile.name, '牧场主')
})

test('corrupt, truncated and mismatched-version payloads are ignored instead of throwing', () => {
  const storage = createStorage()
  const { readRanchDashboardCache, ranchDashboardCacheKey } = loadModule(storage)
  const key = ranchDashboardCacheKey('a1')
  for (const bad of ['', '{', 'null', '[]', '{"version":2,"savedAt":1}', '{"version":1,"savedAt":"x"}']) {
    storage.setItem(key, bad)
    assert.equal(readRanchDashboardCache('a1'), null)
  }
  storage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), profile: 'not-an-object' }))
  const entry = readRanchDashboardCache('a1')
  assert.equal(entry.profile, null)
  assert.equal(entry.snapshot, null)
})

test('expired snapshots and missing storage degrade to no cache', () => {
  const storage = createStorage()
  const { readRanchDashboardCache, ranchDashboardCacheKey } = loadModule(storage)
  storage.setItem(ranchDashboardCacheKey('old'), JSON.stringify({ version: 1, savedAt: Date.now() - 8 * 24 * 3600 * 1000, profile }))
  assert.equal(readRanchDashboardCache('old'), null)
  const noStorage = loadModule(null)
  assert.equal(noStorage.readRanchDashboardCache('a1'), null)
  assert.equal(noStorage.writeRanchDashboardCache('a1', { profile }), false)
})

test('oversized category payloads are truncated rather than exceeding the storage budget', () => {
  const storage = createStorage()
  const { readRanchDashboardCache, writeRanchDashboardCache } = loadModule(storage)
  const items = Array.from({ length: 500 }, (_, index) => ({ id: String(index), count: '1' }))
  writeRanchDashboardCache('a1', { snapshot: { items } })
  const entry = readRanchDashboardCache('a1')
  assert.equal(entry.snapshot.items.length, 200)
})
