import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import * as vueRouter from 'vue-router'

const source = readFileSync(new URL('../src/router/index.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source.replace('import.meta.env.BASE_URL', "'/'"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText

function fixture(initialSpace = 'farm') {
  let space = initialSpace
  let progress = false
  let reloads = 0
  const gameSpace = { get isRanch() { return space === 'ranch' }, setSpace: value => { space = value } }
  const mod = { exports: {} }
  const session = new Map()
  const routes = ['personal', 'ranch', 'settings'].map(path => ({ path, name: path, component: {} }))
  const imports = {
    '@vueuse/core': { useStorage: () => ({ value: 'token' }) },
    '@/stores/game-space': { useGameSpaceStore: () => gameSpace },
    'vue-router': {
      ...vueRouter,
      createWebHistory: vueRouter.createMemoryHistory,
      createRouter: options => {
        const layout = options.routes.find(route => route.path === '/')
        layout.component = {}
        layout.children.find(route => route.name === 'ranch-section').component = {}
        return vueRouter.createRouter(options)
      },
    },
    './menu': { menuRoutes: routes },
    'nprogress': { configure() {}, start() { progress = true }, done() { progress = false } },
    'nprogress/nprogress.css': {},
  }
  new Function('require', 'exports', 'module', 'window', 'sessionStorage', js)(
    id => { assert.ok(id in imports, `unexpected import ${id}`); return imports[id] },
    mod.exports, mod,
    { location: { reload: () => { reloads++ } } },
    { getItem: key => session.get(key), setItem: (key, value) => session.set(key, value) },
  )
  return { router: mod.exports.default, gameSpace, space: () => space, progress: () => progress, reloads: () => reloads }
}

function travel(router, direction) {
  return new Promise((resolve, reject) => {
    const stop = router.afterEach((route, _from, failure) => {
      stop()
      if (failure) reject(failure)
      else resolve(route.fullPath)
    })
    router.go(direction)
  })
}

test('back and forward restore the scene and the full route', async () => {
  const { router, space } = fixture()
  await router.push('/personal?tab=bag#items')
  await router.push('/ranch/personal?tab=bag#items')
  assert.equal(space(), 'ranch')
  assert.equal(await travel(router, -1), '/personal?tab=bag#items')
  assert.equal(space(), 'farm')
  assert.equal(await travel(router, 1), '/ranch/personal?tab=bag#items')
  assert.equal(space(), 'ranch')
})

test('entry uses the stored scene and shared routes leave it unchanged', async () => {
  const { router, gameSpace, space } = fixture('ranch')
  await router.push('/personal?tab=bag#items')
  assert.equal(router.currentRoute.value.fullPath, '/ranch/personal?tab=bag#items')
  await router.push('/settings')
  assert.equal(space(), 'ranch')
  gameSpace.setSpace('farm')
  await router.push('/personal')
  assert.equal(router.currentRoute.value.fullPath, '/personal')
  assert.equal(space(), 'farm')
})

test('failed route imports always finish progress without changing scene', async () => {
  const { router, space, progress, reloads } = fixture()
  router.addRoute({ path: '/ranch/broken', component: async () => { throw new Error('Unable to preload CSS for /assets/page.css') } })
  router.addRoute({ path: '/broken', component: async () => { throw new Error('Unexpected module failure') } })
  await router.push('/personal')
  for (const [path, message, reloadCount] of [
    ['/ranch/broken', /Unable to preload CSS/, 1],
    ['/ranch/broken', /Unable to preload CSS/, 1],
    ['/broken', /Unexpected module failure/, 1],
  ]) {
    await assert.rejects(router.push(path), message)
    assert.equal(progress(), false)
    assert.equal(reloads(), reloadCount)
    assert.equal(space(), 'farm')
    assert.equal(router.currentRoute.value.path, '/personal')
  }
})
