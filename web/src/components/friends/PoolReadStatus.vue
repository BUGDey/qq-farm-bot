<script setup lang="ts">
/**
 * 好友号池「自动读等级」状态条。
 *
 * 后端在空闲时自动补读等级/犬种：按账号轮换，一个账号跑完一轮后冷却 24 小时，
 * 冷却结束才开新一轮。这里把当前进度和每个账号的冷却剩余时间展示出来。
 * 每 20 秒刷新一次；组件自身不发请求以外的副作用。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import api from '@/api'

interface AutoReadAccount {
  accountId: string
  lastRunAt: number
  nextEligibleAt: number
  remainingMs: number
}

interface AutoReadStatus {
  running: boolean
  startedAt: number
  finishedAt: number
  currentRead: number
  currentBatches: number
  currentAccounts: string[]
  lastError: string
  lastRunAt: number
  lastAccountId: string
  lastResult: { total?: number; ok?: number; failed?: number } | null
  missing: number
  accounts: AutoReadAccount[]
  nextEligibleAt: number
  cooldownMs: number
  minTickGapMs: number
}

const props = withDefaults(defineProps<{ accountId?: string; refreshMs?: number }>(), {
  accountId: '',
  refreshMs: 20000,
})

const status = ref<AutoReadStatus | null>(null)
const now = ref(Date.now())
const loading = ref(false)

let statusTimer: ReturnType<typeof setInterval> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null

function headers() {
  return props.accountId ? { 'x-account-id': props.accountId } : {}
}

async function load() {
  if (!props.accountId) {
    status.value = null
    return
  }
  loading.value = true
  try {
    const res = await api.get('/api/friends/pool/auto-read', {
      headers: headers(),
      skipErrorToast: true,
    } as any)
    if (res.data?.ok) status.value = res.data.data as AutoReadStatus
  } catch {
    // 后端没运行/账号切换时静默失败，保留上一次结果
  } finally {
    loading.value = false
  }
}

function formatTime(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatLeft(ms: number) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`
}

const text = computed(() => {
  const s = status.value
  if (!props.accountId) return '自动读等级：先选一个执行账号'
  if (!s) return loading.value ? '自动读等级：读取状态中…' : '自动读等级：状态未知'
  if (s.running) {
    const accs = s.currentAccounts.length > 0 ? ` · 账号 ${s.currentAccounts.join('、')}` : ''
    return `自动读等级：正在读取（本轮已读 ${s.currentRead} 条，第 ${s.currentBatches + 1} 批${accs}）`
  }
  if (s.missing === 0) return '自动读等级：号池资料已齐全'
  const parts: string[] = [`自动读等级：待读 ${s.missing} 条`]
  if (s.lastRunAt) {
    const r = s.lastResult || {}
    const detail = r.ok != null ? `（成功 ${r.ok ?? 0}，失败 ${r.failed ?? 0}）` : ''
    parts.push(`最近 ${formatTime(s.lastRunAt)}${detail}`)
  }
  const cooling = (s.accounts || []).filter(entry => entry.remainingMs > 0)
  const soonest = cooling[0]
  if (soonest)
    parts.push(`账号 ${soonest.accountId} 冷却中，${formatLeft(soonest.remainingMs)} 后可再读`)
  else
    parts.push('账号可读，等待空闲')
  return parts.join(' · ')
})

const hint = computed(() => {
  const s = status.value
  if (!s) return ''
  const bits: string[] = []
  if (s.lastAccountId) bits.push(`最近使用账号 ${s.lastAccountId}`)
  if (s.lastError) bits.push(`上轮问题：${s.lastError}`)
  return bits.join('；')
})

watch(() => props.accountId, () => { void load() })

onMounted(() => {
  void load()
  statusTimer = setInterval(() => { void load() }, props.refreshMs)
  clockTimer = setInterval(() => { now.value = Date.now() }, 15000)
})

onBeforeUnmount(() => {
  if (statusTimer) clearInterval(statusTimer)
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<template>
  <div class="flex items-start gap-2 text-[11px] leading-5 text-gray-500 dark:text-gray-400" :title="hint">
    <span
      class="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      :class="status?.running ? 'animate-pulse bg-emerald-500' : (status && status.missing === 0 ? 'bg-gray-300' : 'bg-amber-400')"
    />
    <span>{{ text }}</span>
  </div>
</template>