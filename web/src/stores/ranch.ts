import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import api from '@/api'
import { useRanchActionLock } from '@/composables/useRanchActionLock'
import { useAccountStore } from './account'

export const useRanchStore = defineStore('ranch', () => {
  const account = useAccountStore()
  const data = ref<any>(null)
  const loading = ref(false)
  const pending = useRanchActionLock(account)
  const busy = computed(() => pending.has(account.currentAccountId))
  const error = ref('')
  let generation = 0
  let controller: AbortController | null = null
  watch(() => account.currentAccountId, () => {
    generation++
    controller?.abort()
    data.value = null
    error.value = ''
    loading.value = false
  }, { flush: 'sync' })
  async function refresh() {
    const accountId = account.currentAccountId
    if (!accountId || loading.value || busy.value)
      return
    const version = generation
    controller = new AbortController()
    loading.value = true
    error.value = ''
    try {
      const res = await api.get('/api/ranch/status', { timeout: 120000, signal: controller.signal, headers: { 'x-account-id': accountId } })
      if (!res.data.ok)
        throw new Error(res.data.error || '牧场读取失败')
      if (version === generation)
        data.value = res.data.data
    }
    catch (e: any) {
      if (version === generation && e.code !== 'ERR_CANCELED')
        error.value = e.response?.data?.error || e.message || '牧场读取失败'
    }
    finally {
      if (version === generation)
        loading.value = false
    }
  }
  async function mutate(path: string, payload: any) {
    const accountId = account.currentAccountId
    if (!accountId || busy.value || loading.value)
      return
    const version = generation
    let actionError = ''
    pending.add(accountId)
    error.value = ''
    try {
      const res = await api.post(path, payload, { timeout: 120000, headers: { 'x-account-id': accountId } })
      if (!res.data.ok)
        throw new Error(res.data.error || '操作失败')
      if (version === generation && res.data.data?.status)
        data.value = res.data.data.status
    }
    catch (e: any) {
      actionError = e.response?.data?.error || e.message || '操作失败'
    }
    finally {
      pending.delete(accountId)
      if (version === generation) {
        await refresh()
        if (version === generation && actionError)
          error.value = actionError
      }
    }
  }
  return { data, loading, busy, error, refresh, mutate }
})
