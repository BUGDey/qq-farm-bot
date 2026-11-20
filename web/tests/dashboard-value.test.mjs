import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const ts = createRequire(import.meta.url)('typescript')
const source = readFileSync(new URL('../src/utils/number-format.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
})
const exports = {}
new Function('exports', outputText)(exports)
const { formatDashboardValue } = exports

test('dashboard only hides values that were never queried', () => {
  for (const value of [null, undefined, '', '  ', NaN, Infinity, true]) {
    assert.equal(formatDashboardValue(value, () => assert.fail('must not format an empty value')), '—')
  }
})

test('dashboard keeps a confirmed zero instead of hiding it', () => {
  for (const value of [0, -0, '0', '0.00']) {
    assert.equal(formatDashboardValue(value), '0', `value ${String(value)}`)
  }
  assert.equal(formatDashboardValue(0, amount => `${amount} 小时`), '0 小时')
})

test('dashboard retains nonzero values and their display units', () => {
  assert.equal(formatDashboardValue('3', level => `Lv.${level}`), 'Lv.3')
  assert.equal(formatDashboardValue('3600', seconds => `${seconds / 3600}h`), '1h')
  assert.equal(formatDashboardValue(-2), '-2')
})