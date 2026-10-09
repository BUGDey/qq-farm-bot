import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'
import api from '@/api'

export type UserRole = 'user' | 'admin' | 'super_admin'
export type CardType = 'time' | 'quota'
export type CardStatus = 'unused' | 'used' | 'disabled' | 'revoked'

/** 账号有效期 / 订阅信息 */
export interface Subscription {
  code: string
  description: string
  expiresAt: number | null
  isPermanent: boolean
  enabled: boolean
  source: string
  activatedAt: number | null
  totalAddedMs: number
  updatedAt: number | null
}

export interface User {
  id: string
  username: string
  role: UserRole
  nick: string
  email: string
  phone: string
  remark: string
  accountLimit: number
  subscription: Subscription | null
  /** 兼容旧字段，等价于 subscription */
  card: Subscription | null
  isExpired: boolean
  remainingMs: number | null
  remainingText: string
  expiresAtText: string
  mustChangePassword: boolean
  createdAt: number
  updatedAt: number
  createdBy: string
  lastLoginAt: number | null
  lastLoginIp: string
  accountCount?: number
}

export interface Card {
  code: string
  type: CardType
  description: string
  durationValue: number
  durationUnit: string
  durationMs: number | null
  days: number
  isPermanent: boolean
  value: number
  valueText: string
  enabled: boolean
  revoked: boolean
  status: CardStatus
  usedBy: string | null
  usedAt: number | null
  batchId: string
  createdAt: number
  createdBy: string
}

export interface Redemption {
  id: string
  at: number
  code: string
  cardType: CardType
  username: string
  operator: string
  action: 'register' | 'redeem' | 'revoke'
  summary: string
  before: { expiresAt: number | null, isPermanent: boolean, accountLimit: number } | null
  after: { expiresAt: number | null, isPermanent: boolean, accountLimit: number } | null
}

export interface LoginLog {
  id: string
  timestamp: number
  event: string
  username: string
  errorType: string | null
  ip: string
  userAgent: string
}

export interface LoginResult {
  ok: boolean
  error?: string
  errorType?: 'rate_limit' | 'locked' | 'invalid_credentials' | 'expired' | 'disabled'
  remainingMs?: number
  data?: {
    token: string
    role: UserRole
    subscription: Subscription | null
    accountLimit: number
    isExpired: boolean
    user: { username: string }
    mustChangePassword?: boolean
  }
}

export interface ApiResult<T = any> {
  ok: boolean
  error?: string
  data?: T
}

function unwrap<T = any>(res: any): ApiResult<T> {
  return res?.data || { ok: false }
}

function formatDurationMs(ms: number): string {
  const totalHours = Math.round(ms / 3600000)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0 && hours > 0)
    return `${days} 天 ${hours} 小时`
  if (days > 0)
    return `${days} 天`
  if (hours > 0)
    return `${hours} 小时`
  return `${Math.max(1, Math.round(ms / 60000))} 分钟`
}

/** 卡密面值展示 */
export function formatCardValue(card: Partial<Card> | null | undefined): string {
  if (!card)
    return '-'
  if (card.type === 'quota')
    return `+${card.value ?? 0} 额度`
  if (card.isPermanent)
    return '永久'
  // 周/月/年卡按生成时的单位直观展示（durationMs 是折算后的毫秒数）
  const unitValue = Number(card.durationValue ?? 0)
  if (unitValue > 0 && card.durationUnit === 'week')
    return `${unitValue} 周`
  if (unitValue > 0 && card.durationUnit === 'month')
    return `${unitValue} 个月`
  if (unitValue > 0 && card.durationUnit === 'year')
    return `${unitValue} 年`
  if (Number(card.durationMs) > 0)
    return formatDurationMs(Number(card.durationMs))
  const value = Number(card.durationValue ?? card.days ?? 0)
  if (value > 0)
    return `${value}${card.durationUnit === 'hour' ? ' 小时' : ' 天'}`
  return '-'
}

export function formatExpiresAt(sub: Subscription | null | undefined): string {
  if (!sub)
    return '未激活'
  if (sub.isPermanent)
    return '永久有效'
  if (!sub.expiresAt)
    return '未激活'
  return new Date(sub.expiresAt).toLocaleString('zh-CN', { hour12: false })
}

export function formatRemaining(remainingMs: number | null | undefined): string {
  if (remainingMs === null || remainingMs === undefined)
    return '永久有效'
  if (remainingMs <= 0)
    return '已过期'
  return `剩余 ${formatDurationMs(remainingMs)}`
}

const CARD_STATUS_TEXT: Record<CardStatus, string> = {
  unused: '未使用',
  used: '已使用',
  disabled: '已禁用',
  revoked: '已作废',
}

export function cardStatusText(status: CardStatus | string): string {
  return CARD_STATUS_TEXT[status as CardStatus] || status
}

export const useUserStore = defineStore('user', () => {
  const token = useStorage('admin_token', '')
  const userInfo = useStorage<User | null>('user_info', null)

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => userInfo.value?.role === 'admin' || userInfo.value?.role === 'super_admin')
  const isSuperAdmin = computed(() => userInfo.value?.role === 'super_admin')
  const username = computed(() => userInfo.value?.username || '')
  const role = computed<UserRole>(() => userInfo.value?.role || 'user')
  const subscription = computed(() => userInfo.value?.subscription || userInfo.value?.card || null)
  const userCard = computed(() => subscription.value)
  const accountLimit = computed(() => userInfo.value?.accountLimit ?? 1)
  const accountCount = computed(() => userInfo.value?.accountCount ?? 0)
  const isExpired = computed(() => {
    const sub = subscription.value
    if (!sub)
      return false
    if (sub.isPermanent)
      return false
    return !!sub.expiresAt && Date.now() > sub.expiresAt
  })
  const expireTimeText = computed(() => formatExpiresAt(subscription.value))

  async function login(name: string, password: string): Promise<LoginResult> {
    try {
      const res = await api.post('/api/login', { username: name, password })
      if (res.data?.ok) {
        token.value = res.data.data.token
        userInfo.value = {
          id: '',
          username: res.data.data.user.username,
          role: res.data.data.role,
          nick: '',
          email: '',
          phone: '',
          remark: '',
          accountLimit: res.data.data.accountLimit ?? 1,
          subscription: res.data.data.subscription || res.data.data.card || null,
          card: res.data.data.subscription || res.data.data.card || null,
          isExpired: res.data.data.isExpired === true,
          remainingMs: null,
          remainingText: '',
          expiresAtText: '',
          mustChangePassword: res.data.data.mustChangePassword === true,
          createdAt: 0,
          updatedAt: 0,
          createdBy: '',
          lastLoginAt: null,
          lastLoginIp: '',
        }
      }
      return res.data
    }
    catch (error: any) {
      const data = error?.response?.data
      if (data)
        return { ok: false, error: data.error, errorType: data.errorType, remainingMs: data.remainingMs }
      return { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function register(name: string, password: string, cardCode: string) {
    try {
      const res = await api.post('/api/register', { username: name, password, cardCode })
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function logout() {
    try {
      await api.post('/api/logout')
    }
    finally {
      token.value = ''
      userInfo.value = null
    }
  }

  async function fetchUserInfo() {
    try {
      const res = await api.get('/api/user/me')
      if (res.data?.ok) {
        userInfo.value = { ...userInfo.value, ...res.data.data } as User
        if (!res.data.data.subscription && res.data.data.card)
          userInfo.value!.subscription = res.data.data.card
      }
      return res.data
    }
    catch {
      return { ok: false }
    }
  }

  async function peekCard(code: string) {
    try {
      const res = await api.get(`/api/card/info/${encodeURIComponent(code)}`)
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: '卡密查询失败' }
    }
  }

  async function renew(cardCode: string) {
    try {
      const res = await api.post('/api/user/renew', { cardCode })
      if (res.data?.ok && userInfo.value) {
        userInfo.value.subscription = res.data.data.subscription || res.data.data.card
        userInfo.value.card = res.data.data.subscription || res.data.data.card
        userInfo.value.accountLimit = res.data.data.accountLimit
      }
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function changePassword(oldPassword: string, newPassword: string) {
    try {
      const res = await api.post('/api/user/change-password', { oldPassword, newPassword })
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function verifyResetPassword(name: string, cardCode: string) {
    try {
      const res = await api.post('/api/public/reset-password/verify', { username: name, cardCode })
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function resetPassword(name: string, cardCode: string, newPassword: string) {
    try {
      const res = await api.post('/api/public/reset-password/confirm', { username: name, cardCode, newPassword })
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  // ============ 管理员：用户管理 ============

  async function fetchUsers(): Promise<User[]> {
    try {
      const res = await api.get('/api/admin/users')
      return res.data?.ok ? (res.data.data || []) : []
    }
    catch {
      return []
    }
  }

  async function fetchUserStats() {
    try {
      const res = await api.get('/api/admin/users/stats')
      return res.data?.ok ? res.data.data : null
    }
    catch {
      return null
    }
  }

  async function createUser(payload: Record<string, any>) {
    try {
      const res = await api.post('/api/admin/users', payload)
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function editUser(name: string, payload: Record<string, any>) {
    try {
      const res = await api.post(`/api/admin/users/${encodeURIComponent(name)}/edit`, payload)
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function updateUserStatus(name: string, payload: Record<string, any>) {
    try {
      const res = await api.post(`/api/admin/users/${encodeURIComponent(name)}`, payload)
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function renewUser(name: string, cardCode: string) {
    try {
      const res = await api.post(`/api/admin/users/${encodeURIComponent(name)}/renew`, { cardCode, confirmed: true })
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function deleteUser(name: string, force = false) {
    try {
      const res = await api.delete(`/api/admin/users/${encodeURIComponent(name)}`, {
        data: { confirmed: true, force },
      })
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function clearExpiredUsers() {
    try {
      const res = await api.post('/api/admin/users/clear-expired', { confirmed: true })
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function fetchUserAccounts(name: string, withConfig = false) {
    try {
      const res = await api.get(`/api/admin/users/${encodeURIComponent(name)}/accounts`, {
        params: { withConfig: withConfig ? '1' : '0' },
      })
      return res.data?.ok ? res.data.data : null
    }
    catch {
      return null
    }
  }

  // ============ 管理员：卡密管理 ============

  async function fetchCards(params: { type?: string, status?: string, keyword?: string } = {}): Promise<Card[]> {
    try {
      const res = await api.get('/api/admin/cards', { params })
      return res.data?.ok ? (res.data.data || []) : []
    }
    catch {
      return []
    }
  }

  async function fetchCardStats() {
    try {
      const res = await api.get('/api/admin/cards/stats')
      return res.data?.ok ? res.data.data : null
    }
    catch {
      return null
    }
  }

  async function createCard(payload: Record<string, any>) {
    try {
      const res = await api.post('/api/admin/cards', { confirmed: true, ...payload })
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function updateCard(code: string, payload: Record<string, any>) {
    try {
      const res = await api.post(`/api/admin/cards/${encodeURIComponent(code)}`, { confirmed: true, ...payload })
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function deleteCard(code: string) {
    try {
      const res = await api.delete(`/api/admin/cards/${encodeURIComponent(code)}`, { data: { confirmed: true } })
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function deleteCardsBatch(codes: string[]) {
    try {
      const res = await api.post('/api/admin/cards/batch-delete', { codes, confirmed: true })
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  async function fetchRedemptions(params: { username?: string, code?: string, limit?: number } = {}) {
    try {
      const res = await api.get('/api/admin/card-redemptions', { params })
      return res.data?.ok ? res.data.data : { redemptions: [], total: 0 }
    }
    catch {
      return { redemptions: [], total: 0 }
    }
  }

  async function fetchMyRedemptions(limit = 50) {
    try {
      const res = await api.get('/api/user/redemptions', { params: { limit } })
      return res.data?.ok ? res.data.data : { redemptions: [], total: 0 }
    }
    catch {
      return { redemptions: [], total: 0 }
    }
  }

  // ============ 管理员：登录日志 ============

  async function fetchLoginLogs(params: { limit?: number, offset?: number, username?: string } = {}) {
    try {
      const res = await api.get('/api/admin/login-logs', { params })
      return res.data?.ok ? res.data.data : { logs: [], total: 0 }
    }
    catch {
      return { logs: [], total: 0 }
    }
  }

  async function clearLoginLogs() {
    try {
      const res = await api.delete('/api/admin/login-logs', { data: { confirmed: true } })
      return unwrap(res)
    }
    catch (error: any) {
      return error?.response?.data || { ok: false, error: error?.message || '网络错误' }
    }
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    isAdmin,
    isSuperAdmin,
    username,
    role,
    subscription,
    userCard,
    accountLimit,
    accountCount,
    isExpired,
    expireTimeText,
    login,
    register,
    logout,
    fetchUserInfo,
    peekCard,
    renew,
    changePassword,
    verifyResetPassword,
    resetPassword,
    fetchUsers,
    fetchUserStats,
    createUser,
    editUser,
    updateUserStatus,
    renewUser,
    deleteUser,
    clearExpiredUsers,
    fetchUserAccounts,
    fetchCards,
    fetchCardStats,
    createCard,
    updateCard,
    deleteCard,
    deleteCardsBatch,
    fetchRedemptions,
    fetchMyRedemptions,
    fetchLoginLogs,
    clearLoginLogs,
  }
})
