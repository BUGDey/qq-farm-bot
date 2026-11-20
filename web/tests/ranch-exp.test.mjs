import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../src/utils/ranch-exp.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})
const module = { exports: {} }
new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
const { createRanchExpSampler, ranchExpForecast, readRanchExp } = module.exports

const progress = { current: 100, needed: 1000 }
const sample = (sampler, exp, at, accountId = 'a', sessionUptime = at / 1000) => sampler.sample({ accountId, exp, at, sessionUptime })

test('only valid exact nonnegative ranch XP is accepted; missing is not zero', () => {
  for (const value of [null, undefined, '', ' ', true, false, {}, '-1', -1, 1.5, '1.5', 'Infinity', Infinity, NaN, '9007199254740992'])
    assert.equal(readRanchExp(value), null, String(value))
  assert.equal(readRanchExp('0'), 0)
  assert.equal(readRanchExp(0), 0)
  assert.equal(readRanchExp('12345'), 12345)
})

test('first real sample waits; consecutive zero growth is a measured zero', () => {
  const sampler = createRanchExpSampler()
  assert.deepEqual(sample(sampler, '1000', 1000), { gain: null, seconds: null })
  const observed = sample(sampler, '1000', 31000)
  assert.deepEqual(observed, { gain: 0, seconds: 30 })
  assert.deepEqual(ranchExpForecast(progress, observed.gain, observed.seconds), {
    rate: '0/小时', eta: '暂无法估算', remaining: '还差 900 经验',
  })
})

test('uses actual cumulative ranch XP difference and observed interval, across level transitions', () => {
  const sampler = createRanchExpSampler()
  sample(sampler, '1000', 1000)
  assert.deepEqual(sample(sampler, '1060', 61000), { gain: 60, seconds: 60 })
  assert.deepEqual(sample(sampler, '1120', 121000), { gain: 120, seconds: 120 })
  assert.deepEqual(ranchExpForecast(progress, 60, 60), { rate: '3,600/小时', eta: '约 15 分钟后升级', remaining: '还差 900 经验' })
})

test('account switch, anonymous selection, XP regression, restart, long gaps and clock rollback reset baseline', () => {
  for (const next of [
    { accountId: 'b', exp: '1100', at: 61000, sessionUptime: 61 },
    { accountId: 'a', exp: '999', at: 61000, sessionUptime: 61 },
    { accountId: 'a', exp: '1100', at: 61000, sessionUptime: 0 },
    { accountId: 'a', exp: '1100', at: 121001, sessionUptime: 121 },
    { accountId: 'a', exp: '1100', at: 999, sessionUptime: 1 },
  ]) {
    const sampler = createRanchExpSampler()
    sample(sampler, '1000', 1000)
    assert.deepEqual(sampler.sample(next), { gain: null, seconds: null })
  }
  for (const invalid of [{ accountId: '', exp: '99999' }, { accountId: 'a', exp: null }, { accountId: 'a', exp: 'invalid' }]) {
    const sampler = createRanchExpSampler()
    sample(sampler, '1000', 1000)
    assert.equal(sampler.sample({ ...invalid, at: 31000 }), null)
    assert.deepEqual(sample(sampler, '1100', 61000), { gain: null, seconds: null })
  }
  const sampler = createRanchExpSampler()
  sample(sampler, '1000', 1000)
  sampler.reset() // visibility change / disconnect / page reload
  assert.deepEqual(sample(sampler, '1100', 61000), { gain: null, seconds: null })
})

test('remaining XP is independent of samples; missing thresholds never imply max level', () => {
  assert.deepEqual(ranchExpForecast(progress, null, null), { rate: '未知', eta: '暂无法估算', remaining: '还差 900 经验' })
  for (const invalid of [null, {}, { current: null, needed: 1000 }, { current: 0, needed: 0 }, { current: 10, needed: 'invalid' }]) {
    assert.equal(ranchExpForecast(invalid, 100, 100).remaining, '剩余经验未知')
    assert.equal(ranchExpForecast(invalid, 100, 100).eta, '暂无法估算')
  }
  assert.equal(ranchExpForecast({ current: 1000, needed: 1000 }, null, null).eta, '经验已达升级要求')
  assert.equal(ranchExpForecast({ current: 1001, needed: 1000 }, 0, 1).remaining, '还差 0 经验')
})

test('ETA uses raw rate, formats minute/hour/day and handles fractional or unavailable rates', () => {
  assert.equal(ranchExpForecast(progress, 900, 60).eta, '约 1 分钟后升级')
  assert.equal(ranchExpForecast(progress, 900, 7200).eta, '约 2.0 小时后升级')
  assert.equal(ranchExpForecast(progress, 900, 172800).eta, '约 2.0 天后升级')
  assert.equal(ranchExpForecast(progress, 1, 7200).rate, '<1/小时')
  for (const seconds of [0, -1, null, undefined, Infinity, NaN])
    assert.equal(ranchExpForecast(progress, 10, seconds).rate, '未知')
})
