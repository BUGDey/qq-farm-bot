<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/api'

type Period = 'daily' | 'weekly' | 'monthly'
type RankType = 'earn' | 'steal'

interface RankRow {
  accountId: string
  name: string
  avatar: string
  platform: string
  owner: string
  steal: number
  earn: number
  savedAt: number
}

const periods: { key: Period, label: string }[] = [
  { key: 'daily', label: '日榜' },
  { key: 'weekly', label: '周榜' },
  { key: 'monthly', label: '月榜' },
]

const period = ref<Period>('daily')
const type = ref<RankType>('earn')
const list = ref<RankRow[]>([])
const loading = ref(false)
const loaded = ref(false)

async function fetchRanking() {
  loading.value = true
  try {
    const { data } = await api.get('/api/ranking', { params: { period: period.value, type: type.value } })
    list.value = data?.ok ? (data.data?.list || []) : []
    loaded.value = true
  }
  catch {
    list.value = []
  }
  finally {
    loading.value = false
  }
}

function switchPeriod(next: Period) {
  if (period.value === next)
    return
  period.value = next
  fetchRanking()
}

function switchType(next: RankType) {
  if (type.value === next)
    return
  type.value = next
  fetchRanking()
}

const rankedList = computed(() => list.value.map((row, index) => ({ ...row, position: index + 1 })))

/** 按示例隐藏真实信息：昵称保留首字符，其余打码 */
function maskName(name: string) {
  const trimmed = String(name || '').trim()
  if (!trimmed)
    return '神秘农场'
  return `${trimmed.slice(0, 1)}******`
}

/** 账号归属用户名打码：首尾保留、中间星号 */
function maskOwner(owner: string) {
  const trimmed = String(owner || '').trim()
  if (!trimmed)
    return '匿名'
  if (trimmed.length <= 2)
    return `${trimmed.slice(0, 1)}****`
  return `${trimmed.slice(0, 1)}*****${trimmed.slice(-1)}`
}

function platformLabel(platform: string) {
  return String(platform || '').toLowerCase() === 'wx' ? '微信' : 'QQ'
}

function formatValue(row: RankRow) {
  if (type.value === 'steal')
    return String(Math.round(row.steal))
  const n = Number(row.earn) || 0
  if (n >= 1e8)
    return `${(n / 1e8).toFixed(1)}亿`
  if (n >= 1e4)
    return `${(n / 1e4).toFixed(1)}万`
  return String(Math.round(n))
}

onMounted(fetchRanking)
</script>

<template>
  <div class="ranking-page">
    <div class="game-card ranking-card">
      <div class="mb-4 flex items-center gap-3">
        <img src="/dashboard/icon-ranking.svg" alt="本站排行" class="h-9 w-9">
        <h1 class="text-xl text-gray-900 font-bold">
          本站排行
        </h1>
      </div>

      <div class="mb-3 inline-flex border border-white/55 rounded-lg bg-white/35 p-0.5 backdrop-blur-xl backdrop-saturate-150" role="group" aria-label="排行周期">
        <button
          v-for="p in periods"
          :key="p.key"
          class="rounded-md px-3 py-1.5 text-sm transition"
          :class="period === p.key ? 'bg-emerald-500 text-white font-semibold shadow-sm' : 'text-gray-600 hover:text-gray-900'"
          :aria-pressed="period === p.key"
          @click="switchPeriod(p.key)"
        >
          {{ p.label }}
        </button>
      </div>

      <div class="mb-4 flex items-center gap-2">
        <button
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition"
          :class="type === 'earn' ? 'bg-amber-100 text-amber-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'"
          :aria-pressed="type === 'earn'"
          @click="switchType('earn')"
        >
          <span class="h-2 w-2 rounded-full bg-amber-400" /> 收益
        </button>
        <button
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition"
          :class="type === 'steal' ? 'bg-orange-100 text-orange-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'"
          :aria-pressed="type === 'steal'"
          @click="switchType('steal')"
        >
          <span class="i-carbon-run text-base" /> 偷菜
        </button>
      </div>

      <div v-if="loading && !loaded" class="py-14 text-center text-sm text-gray-400">
        加载中…
      </div>
      <div v-else-if="!rankedList.length" class="py-14 text-center text-sm text-gray-400">
        暂无排行数据，等农场跑起来再来～
      </div>
      <div v-else class="space-y-2.5">
        <div
          v-for="row in rankedList"
          :key="row.accountId"
          class="rank-row"
        >
          <span class="rank-medal" :class="`rank-medal-${Math.min(row.position, 4)}`">
            <template v-if="row.position <= 3">{{ ['🥇', '🥈', '🥉'][row.position - 1] }}</template>
            <template v-else>{{ row.position }}</template>
          </span>
          <img :src="row.avatar || '/default-avatar.png'" alt="" class="rank-avatar">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate text-sm text-gray-900 font-bold">{{ maskName(row.name) }}</span>
              <span class="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700 font-medium">{{ platformLabel(row.platform) }}</span>
            </div>
            <div class="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
              <span class="i-carbon-user text-xs" />
              <span>{{ maskOwner(row.owner) }}</span>
            </div>
          </div>
          <div class="rank-value" :class="type === 'steal' ? 'rank-value-steal' : 'rank-value-earn'">
            {{ type === 'earn' ? '+' : '' }}{{ formatValue(row) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ranking-page {
  max-width: 760px;
  margin: 0 auto;
}

.ranking-card {
  border-radius: 20px;
  border: 1.5px solid rgba(255, 255, 255, 0.65);
  padding: 20px;
  background:
    linear-gradient(180deg, rgba(186, 226, 248, 0.35) 0%, rgba(255, 255, 255, 0.08) 45%, rgba(134, 214, 152, 0.4) 100%),
    linear-gradient(165deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.26) 100%);
  box-shadow:
    0 10px 28px rgba(31, 38, 80, 0.12),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(24px) saturate(1.35);
  -webkit-backdrop-filter: blur(24px) saturate(1.35);
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.rank-medal {
  display: flex;
  width: 34px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  color: #6b7280;
  font-family: 'DM Mono', 'Courier New', monospace;
}

.rank-avatar {
  height: 42px;
  width: 42px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 10px rgba(31, 38, 80, 0.16);
  background: #fff;
}

.rank-value {
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 800;
  font-family: 'DM Mono', 'Courier New', monospace;
}

.rank-value-earn {
  color: #d97706;
}

.rank-value-steal {
  color: #ea580c;
}
</style>
