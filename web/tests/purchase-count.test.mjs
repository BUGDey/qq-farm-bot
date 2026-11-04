import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

// 这个仓库的前端没有独立的测试框架，统一用 Node 自带 runner。
// purchase-count 是纯函数模块，直接把 TS 转成 CJS 加载即可，不必引 vite/vitest。
const require = createRequire(import.meta.url)
const ts = require('typescript')

const source = readFileSync(new URL('../src/utils/purchase-count.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})
const module = { exports: {} }
new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
const { affordableCount, purchaseMaxCount } = module.exports

test('affordableCount 按余额取最紧的一种费用，向下取整', () => {
  // 券够 100 份、喇叭只够 3 份：取 3
  assert.equal(affordableCount([
    { id: 1041, count: 10, balance: 100 },
    { id: 1042, count: 1, balance: 3 },
  ]), 3)
  // 刚好整除
  assert.equal(affordableCount([{ id: 1041, count: 20, balance: 100 }]), 5)
  // 不整除向下取整
  assert.equal(affordableCount([{ id: 1041, count: 20, balance: 99 }]), 4)
  // 余额不足一份
  assert.equal(affordableCount([{ id: 1041, count: 20, balance: 19 }]), 0)
  assert.equal(affordableCount([{ id: 1041, count: 20, balance: 0 }]), 0)
})

test('affordableCount 对未知余额与无效单价不作约束', () => {
  // 余额未知的费用跳过，只由已知费用决定
  assert.equal(affordableCount([
    { id: 1041, count: 10, balance: 50 },
    { id: 1004, count: 1, balance: null },
  ]), 5)
  // 单价 <= 0 跳过
  assert.equal(affordableCount([
    { id: 1041, count: 10, balance: 50 },
    { id: 1004, count: 0, balance: 1 },
  ]), 5)
  // 完全没有可参考的费用（免费商品 / 余额全未知）
  assert.equal(affordableCount([]), Number.POSITIVE_INFINITY)
  assert.equal(affordableCount([{ id: 1041 }]), Number.POSITIVE_INFINITY)
  assert.equal(affordableCount([{ id: 1041, count: 10, balance: null }]), Number.POSITIVE_INFINITY)
})

test('purchaseMaxCount 同时受限购、余额与硬上限约束', () => {
  // 限购 10、余额只够 3
  assert.equal(purchaseMaxCount({
    limitRemaining: 10,
    costs: [{ id: 1041, count: 10, balance: 35 }],
  }), 3)
  // 余额充足、限购 4
  assert.equal(purchaseMaxCount({
    limitRemaining: 4,
    costs: [{ id: 1041, count: 10, balance: 1000 }],
  }), 4)
  // 无限购、余额够 7
  assert.equal(purchaseMaxCount({
    limitRemaining: null,
    costs: [{ id: 1041, count: 10, balance: 75 }],
  }), 7)
  // 免费且无限购：取硬上限，不能被钳成 1
  assert.equal(purchaseMaxCount({ limitRemaining: null, costs: [] }), 9999)
  assert.equal(purchaseMaxCount({ limitRemaining: 10, costs: [] }), 10)
  // 多种费用取最小可购数：min(100/10, 20/3) = 6
  assert.equal(purchaseMaxCount({
    limitRemaining: 10,
    costs: [
      { id: 1041, count: 10, balance: 100 },
      { id: 1042, count: 3, balance: 20 },
    ],
  }), 6)
  // 余额连一份都不够：下限仍是 1，交给提交时的余额校验兜底
  assert.equal(purchaseMaxCount({
    limitRemaining: 10,
    costs: [{ id: 1041, count: 100, balance: 5 }],
  }), 1)
  // 自定义硬上限
  assert.equal(purchaseMaxCount({ limitRemaining: 50, costs: [], cap: 20 }), 20)
  // 售罄（剩余 0）也不低于 1，避免按钮被禁用
  assert.equal(purchaseMaxCount({
    limitRemaining: 0,
    costs: [{ id: 1041, count: 1, balance: 100 }],
  }), 1)
})