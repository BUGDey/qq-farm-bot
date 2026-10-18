<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountStore } from '@/stores/account'
import { useFriendStore } from '@/stores/friend'

const friendStore = useFriendStore()
const accountStore = useAccountStore()
const { currentAccountId } = storeToRefs(accountStore)
const { cheatAnalysis, cheatLoading, cheatError, friends, blacklist } = storeToRefs(friendStore)

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

// 行内操作状态（拉黑/删除进行中的 gid）
const actionBusy = ref<Record<number, boolean>>({})
const actionMsg = ref('')

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

/** 指标胶囊：把摘要拆成一颗颗带底色的胶囊，避免浅灰细字看不清 */
function metricsParts(v: any) {
  const m = v.metrics || {}
  const parts: { label: string, value: string }[] = [
    { label: '样本', value: `${m.count ?? 0} 条` },
    { label: '日均', value: (m.perDay ?? 0).toFixed(1) },
    { label: '凌晨占比', value: `${Math.round((m.dawnRatio ?? 0) * 100)}%` },
  ]
  if (m.regularityCv != null)
    parts.push({ label: '间隔变异', value: String(m.regularityCv) })
  if (m.singleAction)
    parts.push({ label: '', value: '行为单一' })
  parts.push({ label: '活跃跨度', value: `${(m.spanHours ?? 0).toFixed(1)}h` })
  parts.push({ label: '帮忙', value: String(m.helpCount ?? 0) })
  parts.push({ label: '偷菜', value: `${m.stealCount ?? 0}（价值 ${m.stealValue ?? 0}）` })
  return parts
}

// ---- 状态胶囊（高嫌疑/可疑/高活跃/帮助值高/偷价值高） ----

function statusTags(v: any) {
  const tags: { label: string, cls: string }[] = []
  if (!v.protected) {
    if (v.level === 'danger')
      tags.push({ label: '高嫌疑', cls: 'status-tag-red' })
    else if (v.level === 'warn')
      tags.push({ label: '可疑', cls: 'status-tag-amber' })
  }
  if (v.highActive)
    tags.push({ label: '高活跃', cls: 'status-tag-red' })
  if ((v.metrics?.helpCount ?? 0) >= 5)
    tags.push({ label: '帮助值高', cls: 'status-tag-green' })
  if ((v.metrics?.stealValue ?? 0) >= 30)
    tags.push({ label: '偷价值高', cls: 'status-tag-green' })
  return tags
}

// ---- 拉黑 / 删除 ----

const blacklistedGids = computed(() => new Set((blacklist.value || []).map(b => Number(b.gid))))

async function ensureBlacklist() {
  if (currentAccountId.value && (blacklist.value || []).length === 0)
    await friendStore.fetchBlacklist(String(currentAccountId.value))
}

onMounted(() => {
  ensureBlacklist()
})

async function toggleBlack(v: any) {
  if (!currentAccountId.value || actionBusy.value[v.gid])
    return
  actionBusy.value[v.gid] = true
  actionMsg.value = ''
  try {
    await friendStore.toggleBlacklist(String(currentAccountId.value), Number(v.gid))
    actionMsg.value = blacklistedGids.value.has(Number(v.gid))
      ? `已拉黑 ${displayName(v)}`
      : `已取消拉黑 ${displayName(v)}`
  }
  catch (err: any) {
    actionMsg.value = err?.message || '拉黑操作失败'
  }
  finally {
    actionBusy.value[v.gid] = false
  }
}

async function removeFriend(v: any) {
  if (!currentAccountId.value || actionBusy.value[v.gid])
    return
  // eslint-disable-next-line no-alert
  if (!window.confirm(`确定删除好友「${displayName(v)}」吗？删除后无法恢复。`))
    return
  actionBusy.value[v.gid] = true
  actionMsg.value = ''
  try {
    await friendStore.deleteFriend(String(currentAccountId.value), Number(v.gid))
    actionMsg.value = `已删除好友 ${displayName(v)}`
    // 删除后刷新检测结果，把该访客从列表移除
    await friendStore.fetchCheatAnalysis(String(currentAccountId.value))
  }
  catch (err: any) {
    actionMsg.value = err?.message || '删除好友失败'
  }
  finally {
    actionBusy.value[v.gid] = false
  }
}

async function startDetection() {
  if (!currentAccountId.value)
    return
  actionMsg.value = ''
  await Promise.all([
    friendStore.fetchCheatAnalysis(String(currentAccountId.value)),
    ensureBlacklist(),
  ])
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
      <span v-if="actionMsg" class="text-xs font-medium text-[var(--theme-primary)]">
        {{ actionMsg }}
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
          class="flex flex-col items-stretch gap-2 px-4 py-2.5 sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3"
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
              <div class="flex flex-wrap items-center gap-1.5">
                <span
                  v-for="(part, idx) in metricsParts(v)"
                  :key="idx"
                  class="metric-chip"
                >
                  <template v-if="part.label">{{ part.label }} <b>{{ part.value }}</b></template>
                  <template v-else><b>{{ part.value }}</b></template>
                </span>
                <span
                  v-for="tag in statusTags(v)"
                  :key="tag.label"
                  class="status-tag shrink-0"
                  :class="tag.cls"
                >
                  {{ tag.label }}
                </span>
              </div>
            </div>
          </div>
          <div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <button
              class="row-action-btn"
              :class="blacklistedGids.has(Number(v.gid)) ? 'row-action-btn-blacklisted' : ''"
              :disabled="!!actionBusy[v.gid]"
              :title="blacklistedGids.has(Number(v.gid)) ? '取消拉黑' : '一键拉黑当前好友'"
              @click="toggleBlack(v)"
            >
              <span class="i-carbon-close block text-[13px]" />
              <span>{{ blacklistedGids.has(Number(v.gid)) ? '取消拉黑' : '拉黑' }}</span>
            </button>
            <button
              class="row-action-btn row-action-btn-danger"
              :disabled="!!actionBusy[v.gid]"
              title="一键删除当前好友"
              @click="removeFriend(v)"
            >
              <span class="i-carbon-trash-can block text-[13px]" />
              <span>删除</span>
            </button>
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
              :class="v.highActive
                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
                : 'bg-white/70 text-gray-500 dark:bg-white/10 dark:text-gray-400'"
              :title="`近 24 小时内帮助/偷菜操作覆盖 ${v.activeHours24 ?? 0} 个小时（${v.highActive ? '高活跃' : '普通活跃'}）`"
            >
              <span class="i-carbon-time block text-[12px]" />
              {{ v.activeHours24 ?? 0 }}/24
            </span>
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

<style scoped>
/* 指标胶囊：浅底深字，避免细灰字在磨砂背景上看不清 */
.metric-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.72);
  color: #374151;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
}

.metric-chip b {
  color: #111827;
  font-weight: 700;
}

:global(.dark) .metric-chip {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.08);
  color: #d1d5db;
}

:global(.dark) .metric-chip b {
  color: #f9fafb;
}

/* 状态胶囊：高嫌疑/可疑/高活跃 = 红/琥珀，帮助值高/偷价值高 = 绿 */
.status-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
}

.status-tag-red {
  background: rgba(239, 68, 68, 0.14);
  color: #dc2626;
}

.status-tag-amber {
  background: rgba(245, 158, 11, 0.16);
  color: #b45309;
}

.status-tag-green {
  background: rgba(46, 204, 113, 0.16);
  color: #15803d;
}

:global(.dark) .status-tag-red {
  background: rgba(239, 68, 68, 0.22);
  color: #fca5a5;
}

:global(.dark) .status-tag-amber {
  background: rgba(245, 158, 11, 0.22);
  color: #fcd34d;
}

:global(.dark) .status-tag-green {
  background: rgba(46, 204, 113, 0.22);
  color: #6ee7b7;
}

/* 行内操作按钮（拉黑/删除）：小号描边按钮，移动端重置全局 44px 强制尺寸 */
.row-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  min-height: 0;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.6);
  color: #52525b;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.row-action-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.06);
  color: #18181b;
}

.row-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.row-action-btn-blacklisted {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.35);
  color: #dc2626;
}

.row-action-btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}

:global(.dark) .row-action-btn {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: #d4d4d8;
}

:global(.dark) .row-action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
  color: #fafafa;
}

:global(.dark) .row-action-btn-blacklisted {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

@media (max-width: 640px) {
  .row-action-btn {
    padding: 5px 7px;
  }

  .metric-chip {
    padding: 3px 9px;
    font-size: 12px;
  }
}
</style>
