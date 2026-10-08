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
 */
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
  return true
})

router.afterEach(() => NProgress.done())

export default router
