import type { Ref } from 'vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRanchActionLock } from '@/composables/useRanchActionLock'
import api from '@/api'
import { useAccountStore } from '@/stores/account'

// Session-only cache: scoped to the Pinia account store and account ID, never persisted.
const friendCaches = new WeakMap<object, Map<string, { data: any, updatedAt: number }>>()
const friendCacheTtl = 30000

export function useRanchResource(page: Ref<string>) {
  const account = useAccountStore()
  const friendCache = friendCaches.get(account) ?? new Map<string, { data: any, updatedAt: number }>()
  friendCaches.set(account, friendCache)
  const data = ref<any>(null)
  const actionResult = ref<any>(null)
  const loading = ref(false)
  const pending = useRanchActionLock(account)
  const busy = computed(() => pending.has(account.currentAccountId))
  const error = ref('')
  let sequence = 0
  let controller: AbortController | null = null
  const supported = new Set(['friends', 'activity', 'shop', 'illustrated', 'analytics', 'profile', 'dailyBenefit'])
  // 路由用短横线，内部资源名保持 camelCase，两者只在请求路径上做一次映射。
  const resourcePath = (page: string) => (page === 'dailyBenefit' ? 'daily-benefit' : page)
  let pendingRefresh: Promise<void> | null = null
  function refresh() {
    if (pendingRefresh)
      return pendingRefresh
    const pending = performRefresh()
    pendingRefresh = pending
    void pending.finally(() => {
      if (pendingRefresh === pending)
        pendingRefresh = null
    })
    return pending
  }
  async function performRefresh() {
    if (!supported.has(page.value) || !account.currentAccountId || loading.value || busy.value || document.hidden)
      return
    const version = sequence
    const accountId = account.currentAccountId
    const resourcePage = page.value
    controller = new AbortController()
    loading.value = true
    error.value = ''
    try {
      const res = await api.get(`/api/ranch/${resourcePath(page.value)}`, { signal: controller.signal, headers: { 'x-account-id': account.currentAccountId }, timeout: 120000 })
      if (!res.data.ok)
        throw new Error(res.data.error || '牧场数据读取失败')
      if (version === sequence) {
        data.value = res.data.data
        if (resourcePage === 'friends')
          friendCache.set(accountId, { data: data.value, updatedAt: Date.now() })
      }
    }
    catch (e: any) {
      if (version === sequence && e.code !== 'ERR_CANCELED')
        error.value = e.response?.data?.error || e.message
    }
    finally {
      if (version === sequence)
        loading.value = false
    }
  }
  watch([page, () => account.currentAccountId], () => {
    sequence++
    controller?.abort()
    pendingRefresh = null
    const cached = page.value === 'friends' ? friendCache.get(account.currentAccountId) : undefined
    data.value = cached?.data ?? null
    actionResult.value = null
    error.value = ''
    loading.value = false
    if (!cached || Date.now() - cached.updatedAt >= friendCacheTtl)
      void refresh()
  }, { immediate: true, flush: 'sync' })
  let timer: ReturnType<typeof setInterval>
  const visible = () => {
    if (!document.hidden)
      void refresh()
  }
  onMounted(() => {
    timer = setInterval(visible, 30000)
    document.addEventListener('visibilitychange', visible)
  })
  onUnmounted(() => {
    sequence++
    controller?.abort()
    clearInterval(timer)
    document.removeEventListener('visibilitychange', visible)
  })
  async function mutate(payload: Record<string, unknown>) {
    if (!account.currentAccountId || busy.value)
      return false
    const version = sequence
    const accountId = account.currentAccountId
    const refreshToWait = pendingRefresh
    pending.add(accountId)
    if (refreshToWait)
      await refreshToWait
    if (version !== sequence) {
      pending.delete(accountId)
      return false
    }
    if (page.value === 'friends')
      friendCache.delete(account.currentAccountId)
    actionResult.value = null
    error.value = ''
    let actionError = ''
    try {
      const result = await api.post('/api/ranch/action', payload, { headers: { 'x-account-id': accountId }, timeout: 120000 })
      if (!result.data.ok)
        throw new Error(result.data.error || '操作失败')
      if (version === sequence)
        actionResult.value = result.data.data
    }
    catch (e: any) { actionError = e.response?.data?.error || e.message || '操作失败' }
    finally {
      pending.delete(accountId)
      if (version === sequence) {
        await refresh()
        if (version === sequence && actionError)
          error.value = actionError
      }
    }
    return version === sequence && !actionError
  }
  return { data, result: actionResult, loading, busy, error, refresh, mutate }
}
