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
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/DefaultLayout.vue'),
      children: menuRoutes.map(route => ({
        path: route.path,
        name: route.name,
        component: route.component,
      })),
    },
    { path: '/admin', redirect: '/settings?tab=system' },
    { path: '/renewal', redirect: '/login' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  NProgress.start()

  // 未登录访问受保护页面 → 登录页
  if (!to.meta.public && !adminToken.value) {
    return { path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined }
  }

  // 已登录访问登录页 → 首页
  if (to.path === '/login' && adminToken.value) {
    return { path: '/' }
  }

  return true
})

router.afterEach(() => NProgress.done())

export default router
