/**
 * `web/src/utils/datetime.ts` 的最小验证：公告「最近更新」曾把毫秒当秒，显示成 58822 年。
 * 用 node:test 直接跑，不引 vitest（与 purchase-count.test.mjs 同一套手法）。
 */
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, '..', 'src', 'utils', 'datetime.ts'), 'utf8')
const ts = require('typescript')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const mod = { exports: {} }
new Function('exports', 'module', js)(mod.exports, mod)
const { parseEpoch, formatEpochMinute } = mod.exports

test('毫秒时间戳按毫秒解析，不会跑到几万年以后', () => {
  const ms = Date.UTC(2026, 10, 8, 2, 54)
  const date = parseEpoch(ms)
  assert.equal(date.getUTCFullYear(), 2026)
})

test('老数据给的秒也能认出来', () => {
  const sec = Math.floor(Date.UTC(2026, 10, 8, 2, 54) / 1000)
  const date = parseEpoch(sec)
  assert.equal(date.getUTCFullYear(), 2026)
})

test('空值与非法值返回 null，交给调用方兜底文案', () => {
  for (const value of [0, null, undefined, '', 'abc', -5])
    assert.equal(parseEpoch(value), null)
})

test('formatEpochMinute 输出 YYYY-MM-DD HH:mm', () => {
  const ms = new Date(2026, 10, 8, 2, 5).getTime()
  assert.equal(formatEpochMinute(ms), '2026-11-08 02:05')
  assert.equal(formatEpochMinute(null), '')
})