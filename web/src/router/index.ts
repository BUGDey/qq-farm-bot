import { useStorage } from '@vueuse/core'
import NProgress from 'nprogress'
import { createRouter, createWebHistory } from 'vue-router'
import { menuRoutes } from './menu'
import 'nprogress/nprogress.css'

NProgress.configure({ showSpinner: false })

const adminToken = useStorage('admin_token', '')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/Login.vue') },
    {
      path: '/',
      component: () => import('@/layouts/DefaultLayout.vue'),
      children: [...menuRoutes.map(route => ({
        path: route.path,
        name: route.name,
        component: route.component,
        meta: { adminOnly: !!route.adminOnly, superOnly: !!route.superOnly },
      })),
      { path: 'ranch/:section(overview|personal|friends|activity|shop|illustrated|analytics)?', name: 'ranch-section', component: () => import('@/views/Ranch.vue') }],
    },
    { path: '/admin', redirect: '/admin-panel' },
    { path: '/renewal', redirect: '/account' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

/**
 * 登录守卫
 * - 未持有 token 一律跳转登录页
 * - 已登录访问 /login 时回到首页
 * - 角色隔离：superOnly 仅超管、adminOnly 仅管理员可访问，越权回首页
 */
function currentRole(): string {
  try {
    return JSON.parse(localStorage.getItem('user_info') || 'null')?.role || ''
  }
  catch {
    return ''
  }
}

router.beforeEach(async (to) => {
  NProgress.start()

  const hasToken = !!adminToken.value
  if (to.path === '/login') {
    if (hasToken)
      return { path: '/' }
    return true
  }

  if (!hasToken) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // Resolve shared entry links before mounting a farm view, so ranch mode never starts farm requests.
  if (localStorage.getItem('qq-farm-game-space') === 'ranch') {
    const section = ({ '/': 'overview', '/personal': 'personal', '/friends': 'friends', '/shop': 'shop', '/illustrated': 'illustrated', '/analytics': 'analytics' } as Record<string, string>)[to.path]
    if (section)
      return { path: section === 'overview' ? '/ranch' : `/ranch/${section}`, query: to.query, hash: to.hash }
  }

  const role = currentRole()
  if (to.meta.superOnly && role !== 'super_admin')
    return { path: '/' }
  // admin 角色已移除：adminOnly 等同仅超级管理员
  if (to.meta.adminOnly && role !== 'super_admin')
    return { path: '/' }
  return true
})

router.afterEach(() => NProgress.done())

// 构建更新后旧 chunk 会被删除，浏览器缓存的旧入口 JS 仍引用它，动态导入就会 404。
// 捕获这类加载失败并刷新一次，让用户拉到最新的 index.html / 资源指纹，避免卡在旧页面。
router.onError((error) => {
  const message = String(error?.message || error)
  if (!/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed|ChunkLoadError/i.test(message))
    return
  const key = 'qq-farm-chunk-reload'
  const last = Number(sessionStorage.getItem(key) || 0)
  // 5 秒内只刷新一次，避免真正缺资源时陷入无限刷新。
  if (Date.now() - last > 5000) {
    sessionStorage.setItem(key, String(Date.now()))
    window.location.reload()
  }
})

export default router
