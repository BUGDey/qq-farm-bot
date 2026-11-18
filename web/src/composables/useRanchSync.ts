import { onMounted, onUnmounted, watch } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useRanchStore } from '@/stores/ranch'

export function useRanchSync() {
  const store = useRanchStore()
  const account = useAccountStore()
  const refresh = () => {
    if (!document.hidden)
      void store.refresh()
  }
  let timer: ReturnType<typeof setInterval>
  watch(() => account.currentAccountId, refresh, { flush: 'post' })
  onMounted(() => {
    refresh()
    timer = setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
  })
  onUnmounted(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', refresh)
  })
  return store
}
