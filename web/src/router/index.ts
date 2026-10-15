import { useStorage } from '@vueuse/core'
import axios from 'axios'
import NProgress from 'nprogress'
import { createRouter, createWebHistory } from 'vue-router'
import { menuRoutes } from './menu'
import 'nprogress/nprogress.css'

NProgress.configure({ showSpinner: false })

const adminToken = useStorage('admin_token', '')
const userInfo = useStorage('user_info', '')
let sessionPromise: Promise<boolean> | null = null
let sessionBootstrapAttempted = false

async function ensureAdminSession() {
  // 管理页面采用宽松鉴权：已有 token 时直接放行，不在导航时重复校验。
  if (adminToken.value || sessionBootstrapAttempted)
    return true

  if (!sessionPromise) {
    sessionBootstrapAttempted = true
    sessionPromise = axios.post('/api/auto-login', {}, { timeout: 6000 })
      .then(({ data }) => {
        if (!data?.ok)
          return false
        adminToken.value = data.data.token
        userInfo.value = JSON.stringify({
          username: 'admin',
          role: 'admin',
          card: null,
          accountLimit: data.data.accountLimit,
          mustChangePassword: false,
        })
        return true
      })
      .catch(() => false)
      .finally(() => { sessionPromise = null })
  }
  return sessionPromise
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/Login.vue'),
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
    { path: '/renewal', redirect: '/' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  NProgress.start()
  
  // 登录页面无需验证
  if (to.path === '/login')
    return true
  
  // 其他页面需要验证登录状态
  const hasSession = await ensureAdminSession()
  if (!hasSession && !adminToken.value) {
    return '/login'
  }
  
  return true
})

router.afterEach(() => NProgress.done())

export default router
