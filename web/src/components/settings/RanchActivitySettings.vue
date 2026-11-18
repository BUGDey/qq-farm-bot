<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import api from '@/api'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useRanchActionLock } from '@/composables/useRanchActionLock'
import { useAccountStore } from '@/stores/account'

const props = defineProps<{ readonly?: boolean, disabled?: boolean }>()
const account = useAccountStore()
const pending = useRanchActionLock(account)
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const capabilities = ref<Record<string, boolean>>({})
const draft = ref<Record<string, boolean>>({})
const original = ref<Record<string, boolean>>({})
const items = [
  { key: 'autoClaimTasks', capability: 'claimTask', label: '自动领取每日、成长任务奖励' },
  { key: 'autoSubmitOrders', capability: 'submitOrder', label: '自动提交安全物品订单' },
  { key: 'autoClaimIllustrated', capability: 'claimIllustrated', label: '自动领取牧场图鉴奖励' },
  { key: 'autoClaimWeight', capability: 'claimWeight', label: '自动领取重量积分奖励' },
  { key: 'autoDailyBenefit', capability: 'dailyBenefit', label: '自动领取每日福利（每日 1 次）' },
]
const available = computed(() => items.filter(item => capabilities.value[item.capability]))
let generation = 0
let controller: AbortController | null = null

watch(() => account.currentAccountId, async (accountId) => {
  const version = ++generation
  controller?.abort()
  controller = new AbortController()
  error.value = ''
  capabilities.value = {}
  loaded.value = false
  draft.value = {}
  original.value = {}
  loading.value = false
  if (!accountId)
    return
  loading.value = true
  try {
    const { data } = await api.get('/api/ranch/settings', { signal: controller.signal, headers: { 'x-account-id': accountId } })
    if (!data.ok)
      throw new Error(data.error || '牧场日常配置读取失败')
    if (version !== generation)
      return
    loaded.value = true
    capabilities.value = data.data.capabilities || {}
    original.value = Object.fromEntries(items.map(item => [item.key, data.data[item.key] === true]))
    draft.value = { ...original.value }
  }
  catch (e: any) {
    if (version === generation && e.code !== 'ERR_CANCELED')
      error.value = e.response?.data?.error || e.message
  }
  finally {
    if (version === generation)
      loading.value = false
  }
}, { immediate: true, flush: 'sync' })

async function save(): Promise<boolean> {
  if (loading.value || pending.has(account.currentAccountId))
    return false
  if (!loaded.value)
    return true
  const changed = available.value.filter(item => draft.value[item.key] !== original.value[item.key])
  if (props.readonly || !changed.length)
    return true
  const accountId = account.currentAccountId
  if (!accountId)
    return false
  const version = generation
  pending.add(accountId)
  loading.value = true
  try {
    const patch = Object.fromEntries(changed.map(item => [item.key, draft.value[item.key]]))
    const { data } = await api.post('/api/ranch/settings', patch, { headers: { 'x-account-id': accountId } })
    if (!data.ok)
      throw new Error(data.error || '牧场日常配置保存失败')
    if (version !== generation)
      return false
    original.value = { ...draft.value }
    error.value = ''
    return true
  }
  catch (e: any) {
    if (version === generation)
      error.value = e.response?.data?.error || e.message
    return false
  }
  finally {
    pending.delete(accountId)
    if (version === generation)
      loading.value = false
  }
}

onUnmounted(() => {
  generation++
  controller?.abort()
})
defineExpose({ save })
</script>

<template>
  <section class="border border-gray-200/90 rounded-xl bg-white/55 p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/25">
    <h3 class="text-sm text-gray-700 font-medium dark:text-gray-300">
      牧场日常
    </h3>
    <p class="text-xs text-gray-500 dark:text-gray-400">
      随本弹窗的「保存并关闭」一起保存，取消时放弃本次修改。
    </p>
    <p v-if="error" class="text-sm text-red-600 dark:text-red-300" role="alert">
      {{ error }}
    </p>
    <p v-if="loading" class="text-sm text-gray-500" role="status">
      正在读取或保存牧场配置…
    </p>
    <div v-else-if="available.length" class="grid gap-3 sm:grid-cols-2">
      <BaseSwitch v-for="item in available" :key="item.key" v-model="draft[item.key]" :label="item.label" :disabled="readonly || disabled || pending.has(account.currentAccountId)" />
    </div>
    <p v-else-if="!error" class="text-sm text-gray-500">
      当前账号暂无可用的牧场日常自动化。
    </p>
  </section>
</template>
