<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import HeluSolarTermsPanel from './HeluSolarTermsPanel.vue'

// 宿主桥：api（自动携带鉴权头）、getAccountId、onBack。由 main.js 的 mount(el, host) 注入。
// 常驻活动无过期时间，不做窗口自查退出。
const props = defineProps<{ host: any }>()
const emit = defineEmits<{ back: [] }>()
const accountId = ref(String(props.host?.getAccountId?.() || ''))
// 与宿主 Activity.vue 的 L 常量保持一致的文案子集
const labels = { notesTab: '节令小札', empty: '暂无数据' }
const toast = {
  success: (msg: string) => props.host?.toast?.success?.(msg),
  error: (msg: string) => props.host?.toast?.error?.(msg),
}
const solar = ref<HeluSolarTerms | null>(null)
const busy = ref(false)
const error = ref('')
let generation = 0
let disposed = false
let timer: ReturnType<typeof setInterval> | undefined
async function refresh() {
  if (disposed || busy.value || !accountId.value) return
  const version = generation
  busy.value = true
  try {
    const { data } = await props.host.api.get('/api/activity/solar-terms')
    if (version !== generation) return
    solar.value = data.solarTerms
    error.value = ''
  }
  catch (e: any) {
    if (version === generation) error.value = e.response?.data?.error || e.message || '节令读取失败'
  }
  finally {
    busy.value = false
    if (version !== generation && accountId.value) refresh()
  }
}
async function claim(term: { id: number }) {
  if (disposed || busy.value || !accountId.value) return
  const version = generation
  busy.value = true
  try {
    const { data } = await props.host.api.post('/api/activity/solar-terms/claim', { termId: term.id })
    if (version !== generation) return
    if (!data.ok) throw new Error(data.error || '领取失败')
    solar.value = data.solarTerms
    if (data.refreshWarning && solar.value) solar.value.warning = data.refreshWarning
    toast.success('节令奖励领取完成')
  }
  catch (e: any) { if (version === generation) toast.error(e.response?.data?.error || e.message) }
  finally {
    busy.value = false
    if (version !== generation && accountId.value) refresh()
  }
}
async function answer(payload: { id: number, optionIndex: number }) {
  if (disposed || busy.value || !accountId.value) return
  const version = generation
  busy.value = true
  try {
    const { data } = await props.host.api.post('/api/activity/solar-terms/answer', {
      termId: payload.id,
      optionIndex: payload.optionIndex,
    })
    if (version !== generation) return
    if (!data.ok) throw new Error(data.error || '答题失败')
    solar.value = data.solarTerms
    toast[data.correct ? 'success' : 'error'](data.correct ? '答题正确，奖励已发放' : '答案错误，明天再来')
  }
  catch (e: any) { if (version === generation) toast.error(e.response?.data?.error || e.message) }
  finally {
    busy.value = false
    if (version !== generation && accountId.value) refresh()
  }
}
function poll() {
  if (document.visibilityState !== 'visible') return
  const now = Math.floor(Date.now() / 1000)
  if (solar.value
    && !solar.value.terms.some(term => term.startTime <= now && now <= term.endTime)) return
  refresh()
}
function visibility() { if (document.visibilityState === 'visible') refresh() }
watch(accountId, async () => {
  generation++
  solar.value = null
  error.value = ''
  // An outstanding request refreshes the newly selected account after releasing its lock.
  await refresh()
})
onMounted(() => {
  refresh()
  timer = setInterval(poll, 30_000)
  document.addEventListener('visibilitychange', visibility)
})
onUnmounted(() => {
  disposed = true
  generation++
  clearInterval(timer)
  document.removeEventListener('visibilitychange', visibility)
})
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <button @click="$emit('back')">← 返回活动列表</button>
      <button :disabled="busy || !accountId" @click="refresh">{{ busy ? '加载中…' : '刷新' }}</button>
    </div>
    <h2 class="text-xl font-semibold">节令小札</h2>
    <p v-if="!accountId">请先选择账号</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!solar">{{ busy ? '正在读取节令…' : '暂无节令数据' }}</p>
    <HeluSolarTermsPanel v-else :solar-terms="solar" :loading="busy" :labels="labels" @claim="claim" @answer="answer" />
  </section>
</template>
