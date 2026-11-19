import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import axios from 'axios'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../src/api/index.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText

function fixture() {
  const account = { value: 'A' }
  const mod = { exports: {} }
  new Function('require', 'exports', 'module', js)((id) => {
    if (id === '@vueuse/core') return { useStorage: key => key === 'current_account_id' ? account : { value: '' } }
    if (id === '@/stores/toast') return { useToastStore: () => { throw new Error('unexpected toast') } }
    return require(id)
  }, mod.exports, mod)
  const api = mod.exports.default
  api.defaults.adapter = async config => ({ config, data: config.headers.get('x-account-id'), status: 200, statusText: 'OK', headers: new axios.AxiosHeaders() })
  return { account, api }
}

test('both settings writes keep the explicit account even when selection changes between them', async () => {
  const { account, api } = fixture()
  const config = { headers: { 'X-Account-ID': 'A' } }
  assert.equal((await api.post('/api/settings/save', {}, config)).data, 'A')
  account.value = 'B'
  assert.equal((await api.post('/api/automation', {}, config)).data, 'A')
  assert.equal((await api.get('/api/status')).data, 'B')
})
