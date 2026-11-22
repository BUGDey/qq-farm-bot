<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import api from '@/api'

interface LogLine {
  ts: string
  level: string
  module: string
  message: string
  raw: string
}

const lines = ref<LogLine[]>([])
const loading = ref(false)
const autoRefresh = ref(true)
const levelFilter = ref<'all' | 'info' | 'warn' | 'error'>('all')
const keyword = ref('')
const logDir = ref('')
const platform = ref('')
const scroller = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

const filtered = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  return lines.value.filter((line) => {
    if (levelFilter.value !== 'all' && line.level !== levelFilter.value)
      return false
    if (key && !`${line.module} ${line.message}`.toLowerCase().includes(key))
      return false
    return true
  })
})

function formatTs(ts: string) {
  if (!ts)
    return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime()))
    return ts.slice(11, 19)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function levelClass(level: string) {
  if (level === 'error')
    return 'text-red-400'
  if (level === 'warn')
    return 'text-amber-300'
  if (level === 'debug')
    return 'text-gray-500'
  return 'text-emerald-300'
}

async function load(keep = true) {
  loading.value = true
  try {
    const res = await api.get('/api/admin/logs/recent', {
      params: { limit: 600 },
      timeout: 15000,
    } as any)
    if (res.data?.ok) {
      lines.value = Array.isArray(res.data.data?.lines) ? res.data.data.lines : []
      logDir.value = res.data.data?.logDir || ''
      platform.value = res.data.data?.platform || ''
      if (keep)
        await scrollToBottom()
    }
  }
  catch (_) {
    // 日志接口偶尔失败不打断页面
  }
  finally {
    loading.value = false
  }
}

async function scrollToBottom() {
  if (!stickToBottom.value) return
  await nextTick()
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

function onScroll() {
  const el = scroller.value
  if (!el) return
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

watch(autoRefresh, (on) => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (on)
    timer = setInterval(() => load(true), 3000)
})

onMounted(async () => {
  await load(false)
  if (autoRefresh.value)
    timer = setInterval(() => load(true), 3000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
          系统日志
        </h3>
        <p class="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
          {{ platform === 'win32' ? 'Windows：显示的是命令行面板输出的同一份日志' : 'Linux / Docker：显示容器内落盘的日志' }}
          <span v-if="logDir" class="ml-1 text-gray-400">（{{ logDir }}）</span>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <select
          v-model="levelFilter"
          class="rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
        >
          <option value="all">全部级别</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <input
          v-model="keyword"
          placeholder="搜索内容"
          class="w-36 rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
        >
        <label class="flex items-center gap-1 text-gray-600 dark:text-gray-300">
          <input v-model="autoRefresh" type="checkbox">
          自动刷新
        </label>
        <button
          class="rounded border border-gray-300 px-2 py-1 text-gray-600 hover:border-emerald-400 dark:border-gray-600 dark:text-gray-300"
          :disabled="loading"
          @click="load(true)"
        >
          {{ loading ? '读取中' : '刷新' }}
        </button>
      </div>
    </div>

    <div
      ref="scroller"
      class="max-h-[62vh] overflow-auto rounded-md bg-gray-900 px-3 py-2 font-mono text-[11px] leading-5 text-gray-200"
      @scroll="onScroll"
    >
      <div v-if="filtered.length === 0" class="py-8 text-center text-xs text-gray-500">
        还没有日志
      </div>
      <div v-for="(line, index) in filtered" :key="`${line.ts}-${index}`" class="whitespace-pre-wrap break-all">
        <span class="text-gray-500">{{ formatTs(line.ts) }}</span>
        <span class="mx-1" :class="levelClass(line.level)">[{{ line.level || '-' }}]</span>
        <span v-if="line.module" class="text-sky-300">[{{ line.module }}]</span>
        <span class="ml-1">{{ line.message }}</span>
      </div>
    </div>
    <p class="mt-2 text-[11px] text-gray-400">
      共 {{ filtered.length }} 行（最多保留最近 3 天的日志）。滚动到中间会暂停自动跟随，滚回底部即可继续。
    </p>
  </div>
</template>