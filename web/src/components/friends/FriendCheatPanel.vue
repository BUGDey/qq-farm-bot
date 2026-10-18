<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountStore } from '@/stores/account'
import { useFriendStore } from '@/stores/friend'

const friendStore = useFriendStore()
const accountStore = useAccountStore()
const { currentAccountId } = storeToRefs(accountStore)
const { cheatAnalysis, cheatLoading, cheatError, friends } = storeToRefs(friendStore)

const filter = ref('all')
const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'danger', label: '嫌疑高' },
  { key: 'clean', label: '建议清洗' },
  { key: 'lowHelp', label: '低帮价值' },
  { key: 'highHelp', label: '帮价值高' },
  { key: 'highSteal', label: '偷价值高' },
  { key: 'dog', label: '护主犬' },
] as const

const description = computed(() =>
  `基于访客互动记录的行为分析：操作间隔规律性 / 在线时长 / 凌晨活跃占比 / 日均频率 / 行为单一性，综合评出 0-100 嫌疑分。样本在挂机过程中持续积累（${cheatAnalysis.value?.windowHours ?? 72} 小时窗口），护主犬好友自动加分保护。`)

const visitors = computed<any[]>(() => cheatAnalysis.value?.visitors || [])

const filteredVisitors = computed(() => visitors.value.filter((v) => {
  switch (filter.value) {
    case 'danger':
      return v.level === 'danger' && !v.protected
    case 'clean':
      return v.score >= 60 && !v.protected
    case 'lowHelp':
      return !v.protected && (v.metrics?.helpCount ?? 0) <= 1
    case 'highHelp':
      return (v.metrics?.helpCount ?? 0) >= 5
    case 'highSteal':
      return (v.metrics?.stealValue ?? 0) >= 30
    case 'dog':
      return !!v.protected
    default:
      return true
  }
}))

const friendMetaByGid = computed(() => {
  const map = new Map<number, { name: string, avatarUrl: string }>()
  for (const friend of friends.value || []) {
    const gid = Number(friend?.gid)
    if (gid > 0)
      map.set(gid, { name: friend.name || friend.remark || '', avatarUrl: friend.avatarUrl || friend.avatar_url || '' })
  }
  return map
})

function displayName(v: any) {
  return friendMetaByGid.value.get(Number(v.gid))?.name || v.nick || `GID:${v.gid}`
}

function avatarUrl(v: any) {
  return friendMetaByGid.value.get(Number(v.gid))?.avatarUrl || ''
}

function levelLabel(v: any) {
  if (v.protected) return '护主犬'
  return v.level === 'danger' ? '建议清洗' : v.level === 'warn' ? '关注' : '正常'
}

function levelClass(v: any) {
  if (v.protected)
    return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
  if (v.level === 'danger')
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (v.level === 'warn')
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
}

function metricsTitle(v: any) {
  const m = v.metrics || {}
  const parts = [
    `样本 ${m.count ?? 0} 条`,
    `日均 ${(m.perDay ?? 0).toFixed(1)}`,
    `凌晨占比 ${Math.round((m.dawnRatio ?? 0) * 100)}%`,
  ]
  if (m.regularityCv != null)
    parts.push(`间隔变异系数 ${m.regularityCv}`)
  if (m.singleAction)
    parts.push('行为单一')
  parts.push(`活跃跨度 ${(m.spanHours ?? 0).toFixed(1)}h`)
  parts.push(`帮忙 ${m.helpCount ?? 0} / 偷菜 ${m.stealCount ?? 0}（价值 ${m.stealValue ?? 0}）`)
  return parts.join(' · ')
}

async function startDetection() {
  if (!currentAccountId.value)
    return
  await friendStore.fetchCheatAnalysis(String(currentAccountId.value))
}
</script>

<template>
  <div class="space-y-4">
    <div class="border border-white/60 rounded-xl bg-white/55 p-4 text-sm leading-relaxed text-gray-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/10 dark:text-gray-200">
      {{ description }}
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <BaseButton
        variant="primary"
        size="sm"
        :loading="cheatLoading"
        :disabled="!currentAccountId"
        @click="startDetection"
      >
        <span class="i-carbon-search mr-1.5" />
        开始检测
      </BaseButton>
      <span v-if="cheatAnalysis" class="text-sm text-gray-600 dark:text-gray-300">
        共 {{ cheatAnalysis.visitorCount }} 人 · 嫌疑 {{ cheatAnalysis.suspiciousCount }} 人
        <span class="ml-2 text-xs text-gray-400">样本 {{ cheatAnalysis.sampleCount }} 条</span>
      </span>
      <span v-else-if="!cheatLoading" class="text-xs text-gray-400">
        点击「开始检测」拉取最新访客记录并分析
      </span>
    </div>

    <div v-if="cheatError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-300">
      {{ cheatError }}
    </div>

    <div v-if="cheatAnalysis" class="flex flex-wrap gap-2">
      <button
        v-for="item in FILTERS"
        :key="item.key"
        class="rounded-full px-3 py-1 text-xs font-medium transition"
        :class="filter === item.key
          ? 'text-white shadow-sm'
          : 'border border-white/60 bg-white/55 text-gray-700 hover:bg-white/80 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/20'"
        :style="filter === item.key ? { backgroundColor: 'var(--theme-primary)' } : {}"
        @click="filter = item.key"
      >
        {{ item.label }}
      </button>
    </div>

    <div v-if="cheatAnalysis" class="overflow-hidden rounded-xl border border-white/60 bg-white/55 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/10">
      <div class="grid grid-cols-[1fr_auto] gap-2 border-b border-white/50 px-4 py-2.5 text-xs font-semibold text-gray-500 dark:border-white/10 dark:text-gray-400">
        <span>好友</span>
        <span>嫌疑分</span>
      </div>
      <div class="max-h-[480px] divide-y divide-white/40 overflow-y-auto dark:divide-white/10">
        <div
          v-for="v in filteredVisitors"
          :key="v.gid"
          class="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5"
          :title="metricsTitle(v)"
        >
          <div class="flex min-w-0 items-center gap-3">
            <div class="h-9 w-9 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <img v-if="avatarUrl(v)" :src="avatarUrl(v)" class="h-full w-full object-cover">
              <span v-else class="i-carbon-user text-gray-400" />
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{{ displayName(v) }}</span>
                <span
                  v-if="v.protected"
                  class="inline-flex shrink-0 items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                >
                  护主犬
                </span>
              </div>
              <div class="truncate text-[11px] text-gray-400">
                {{ metricsTitle(v) }}
              </div>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span class="rounded-full px-2.5 py-1 text-xs font-bold" :class="levelClass(v)">
              {{ v.score }} · {{ levelLabel(v) }}
            </span>
          </div>
        </div>
        <div v-if="filteredVisitors.length === 0" class="px-4 py-10 text-center text-sm text-gray-400">
          没有符合条件的访客
        </div>
      </div>
    </div>
  </div>
</template>
