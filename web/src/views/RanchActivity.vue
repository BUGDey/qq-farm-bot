<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { computed, ref } from 'vue'
import RanchPageShell from '@/components/ranch/RanchPageShell.vue'
import { useRanchResource } from '@/composables/useRanchResource'

interface RanchActivityItem {
  id?: number | string
  name?: string
  title?: string
  startTime?: number | string
  endTime?: number | string
  status?: number | string
  statusLabel?: string
}

const page = ref('activity')
const resource = useRanchResource(page)
const nowMs = ref(Date.now())
// 时间窗状态要跟着走，否则页面一直停在打开那一刻的“进行中”。
useIntervalFn(() => { nowMs.value = Date.now() }, 30000)

// 服务端时间窗可能是秒（默认）也可能是毫秒，先统一成毫秒再比较，
// 否则秒级时间戳会被当成 1970 年，活动状态就会算错。
function toMs(value: unknown): number {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw <= 0)
    return 0
  return raw < 1e12 ? raw * 1000 : raw
}

const activities = computed<RanchActivityItem[]>(() => {
  const list = resource.data.value?.activities
  return Array.isArray(list) ? list : []
})

function windowOf(item: RanchActivityItem) {
  return { startMs: toMs(item.startTime), endMs: toMs(item.endTime) }
}

function statusOf(item: RanchActivityItem): 'active' | 'upcoming' | 'ended' | 'unknown' {
  const { startMs, endMs } = windowOf(item)
  if (!startMs && !endMs)
    return 'unknown'
  if (startMs && nowMs.value < startMs)
    return 'upcoming'
  if (endMs && nowMs.value > endMs)
    return 'ended'
  return 'active'
}

const statusLabels: Record<string, string> = {
  active: '进行中',
  upcoming: '未开始',
  ended: '已结束',
  unknown: '时间未公布',
}

const statusClasses: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  upcoming: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  ended: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  unknown: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

function formatTime(ms: number) {
  if (!ms)
    return '时间未公布'
  return new Date(ms).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function windowText(item: RanchActivityItem) {
  const { startMs, endMs } = windowOf(item)
  if (!startMs && !endMs)
    return '时间未公布'
  return `${formatTime(startMs)} - ${formatTime(endMs)}`
}

function titleOf(item: RanchActivityItem) {
  return item.name || item.title || `活动 ${item.id ?? ''}`.trim()
}
</script>

<template>
  <RanchPageShell title="活动" :loading="resource.loading.value" :busy="resource.busy.value" :error="resource.error.value" :has-data="!!resource.data.value" @refresh="resource.refresh">
    <div v-if="!activities.length" class="ui-card rounded-lg p-8 text-center text-gray-500">
      {{ resource.data.value?.message || '暂无已登记的牧场限时活动' }}
      <p class="mt-2 text-xs">
        牧场活动以服务端下发的时间窗为准；未下发前不会显示猜测的档期。
      </p>
    </div>
    <div v-else class="grid gap-3 md:grid-cols-2">
      <article v-for="activity in activities" :key="String(activity.id ?? activity.name)" class="ui-card rounded-lg p-4">
        <div class="flex items-start justify-between gap-3">
          <h2 class="min-w-0 truncate text-base font-semibold">
            {{ titleOf(activity) }}
          </h2>
          <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px]" :class="statusClasses[statusOf(activity)]">
            {{ statusLabels[statusOf(activity)] }}
          </span>
        </div>
        <p class="mt-2 text-xs text-gray-500">
          {{ windowText(activity) }}
        </p>
        <p v-if="activity.statusLabel" class="mt-1 text-xs text-gray-500">
          {{ activity.statusLabel }}
        </p>
      </article>
    </div>
  </RanchPageShell>
</template>
