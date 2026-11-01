<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import api from '@/api'
import { APP_VERSION } from '@/data/update-log'

/**
 * 服务版本号 + 面板运行时长。
 *
 * 版本优先取后端 `/api/health` 回报的 `version`（即正在运行的那份 core），
 * 取不到时回退到构建时的 `APP_VERSION`；运行时长由后端 `startedAt` 换算，
 * 本地每秒自增，不轮询也不会累积漂移。
 */
const serverVersion = ref('')
const startedAt = ref(0)
const nowTick = ref(Date.now())

let tickTimer: ReturnType<typeof setInterval> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

const versionText = computed(() => `v${serverVersion.value || APP_VERSION}`)

const uptimeMs = computed(() => (startedAt.value > 0 ? Math.max(0, nowTick.value - startedAt.value) : 0))

function pad(value: number) {
  return String(value).padStart(2, '0')
}

const uptimeText = computed(() => {
  if (!startedAt.value)
    return ''
  const totalSec = Math.floor(uptimeMs.value / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  return days > 0
    ? `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
    : `${hours}h ${pad(minutes)}m ${pad(seconds)}s`
})

const startedAtTitle = computed(() => {
  if (!startedAt.value)
    return ''
  return `服务启动于 ${new Date(startedAt.value).toLocaleString('zh-CN', { hour12: false })}`
})

async function loadStatus() {
  try {
    // 必须带 /api 前缀：baseURL 是 '/'，写成 '/health' 会被 SPA 回退接走
    const response = await api.get('/api/health', { skipErrorToast: true } as any)
    const payload = (response?.data?.data ?? response?.data ?? {}) as Record<string, any>
    if (!payload || typeof payload !== 'object')
      return
    const version = String(payload.version || '').trim()
    if (version)
      serverVersion.value = version
    const started = Number(payload.startedAt) || 0
    if (started > 0) {
      startedAt.value = started
    }
    else if (Number(payload.uptime) > 0) {
      // 旧版本 core 只回 uptime（秒），换算成绝对起点
      startedAt.value = Date.now() - Math.round(Number(payload.uptime) * 1000)
    }
  }
  catch {
    // 接口不可用时保持显示构建版本，不打扰用户
  }
}

onMounted(() => {
  loadStatus()
  tickTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
  // 服务重启后版本/启动时间会变，定期校准一次即可
  pollTimer = setInterval(loadStatus, 60 * 1000)
})

onUnmounted(() => {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <div
    class="server-status flex shrink-0 flex-col items-start gap-0.5 whitespace-nowrap border border-gray-200/70 rounded-full bg-white/60 px-3 py-1 text-[11px] text-gray-500 backdrop-blur-sm sm:flex-row sm:items-center sm:gap-2 dark:border-gray-700/70 dark:bg-gray-800/60 dark:text-gray-400"
    :title="startedAtTitle"
  >
    <span class="inline-flex items-center gap-1" title="当前版本号">
      <span class="i-carbon-tag block text-[12px]" />
      {{ versionText }}
    </span>
    <span class="hidden h-3 w-px bg-gray-300/70 sm:block dark:bg-gray-600/70" />
    <span class="inline-flex items-center gap-1" :title="startedAtTitle || '面板运行时长'">
      <span class="i-carbon-timer block text-[12px]" />
      <template v-if="uptimeText">
        运行 {{ uptimeText }}
      </template>
      <template v-else>
        运行中
      </template>
    </span>
  </div>
</template>
