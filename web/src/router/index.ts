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
      children: menuRoutes.map(route => ({
        path: route.path,
        name: route.name,
        component: route.component,
        meta: { adminOnly: !!route.adminOnly, superOnly: !!route.superOnly },
      })),
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

  const role = currentRole()
  if (to.meta.superOnly && role !== 'super_admin')
    return { path: '/' }
  // admin 角色已移除：adminOnly 等同仅超级管理员
  if (to.meta.adminOnly && role !== 'super_admin')
    return { path: '/' }
  return true
})

router.afterEach(() => NProgress.done())

export default router
