import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dashboard = await readFile(resolve(here, '../src/views/Dashboard.vue'), 'utf8')

test('farm dashboard exposes ranch module in its log filters', () => {
  assert.match(dashboard, /\{ label: '牧场', value: 'ranch' \}/)
})

test('farm dashboard searches every keyword token across module and message fields', () => {
  assert.match(dashboard, /const keywords = kw\.split\(\/\\s\+\/\)\.filter\(Boolean\)/)
  assert.match(dashboard, /const searchText = \[log\.tag, log\.event, log\.msg, log\.module, log\.action\]/)
  assert.match(dashboard, /keywords\.some\(keyword => !searchText\.includes\(keyword\)\)/)
})
