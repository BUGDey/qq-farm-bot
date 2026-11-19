<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import RanchPageShell from '@/components/ranch/RanchPageShell.vue'
import SceneTabs from '@/components/shared/SceneTabs.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useRanchResource } from '@/composables/useRanchResource'
import { useAccountStore } from '@/stores/account'
import { formatCouponAmount } from '@/utils/number-format'
import '@/components/ranch/ranch-glass.css'

const page = ref('illustrated')
const resource = useRanchResource(page)
const kind = ref('normal')
const isGiant = computed(() => kind.value === 'giant')
const tab = ref('all')
const query = ref('')
const pending = ref<any>(null)
const account = useAccountStore()
watch(() => account.currentAccountId, () => {
  pending.value = null
})

async function claim() {
  const payload = pending.value
  pending.value = null
  if (payload)
    await resource.mutate(payload)
}

const entries = computed<any[]>(() => {
  const normal = resource.data.value?.list || []
  if (!isGiant.value)
    return normal
  return normal.flatMap((entry: any) => entry.giantItem
    ? [{ ...entry, fruitId: entry.giantItem.id, name: entry.giantItem.name, image: entry.giantItem.image, unlocked: !!entry.giant?.unlocked }]
    : [])
})
const list = computed(() => entries.value.filter(entry => (tab.value === 'all' || tab.value === (entry.unlocked ? 'unlocked' : 'locked')) && (!query.value || String(entry.fruitId).includes(query.value) || String(entry.name || '').includes(query.value))))
const unlockedCount = computed(() => entries.value.filter(entry => entry.unlocked).length)
const totalCount = computed(() => entries.value.length)

const levelRewards = computed(() => resource.data.value?.levels?.levelList || [])
const weightRewards = computed(() => resource.data.value?.weightScore?.levels || [])

function rewardText(rewards: any[]) {
  return (rewards || []).map(r => `${r.name || `物品 ${r.id}`} ×${r.count}`).join(' · ')
}
function statusLabel(row: any) {
  return row.claimed ? '已领取' : row.canClaim ? '可领取' : '未达到'
}
function statusClass(row: any) {
  return row.claimed
    ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
    : row.canClaim
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
}
function weightText(entry: any) {
  return `重 ${Number(entry.bestWeightX10) / 10} · 收 ${entry.harvestCount}`
}

onMounted(() => {
  void resource.refresh()
})
</script>

<template>
  <RanchPageShell class="ranch-glass-page" title="图鉴" :loading="resource.loading.value" :busy="resource.busy.value" :error="resource.error.value" :has-data="!!resource.data.value" @refresh="resource.refresh">
    <div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
      <div class="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div class="min-w-0 flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2">
            <span class="i-carbon-book text-2xl text-emerald-500" />
            <h1 class="text-xl font-bold">
              图鉴
            </h1>
          </div>
          <span class="h-8 flex items-center gap-2 rounded-lg bg-gray-50 px-3 text-xs text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
            图鉴等级 <strong class="text-sm">{{ resource.data.value?.currentLevel ?? '—' }}</strong>
          </span>
          <span class="h-8 flex items-center gap-2 rounded-lg bg-gray-50 px-3 text-xs text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
            进度 <strong class="text-sm">{{ resource.data.value?.totalProgress ?? '—' }}</strong>
          </span>
          <span class="h-8 flex items-center gap-2 rounded-lg bg-gray-50 px-3 text-xs text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
            重量积分 <strong class="text-sm">{{ resource.data.value?.weightScore?.totalScore ?? '—' }}</strong>
          </span>
          <span class="h-8 flex items-center gap-2 rounded-lg bg-gray-50 px-3 text-xs text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
            已收集 <strong class="text-sm">{{ unlockedCount }} / {{ totalCount }}</strong>
          </span>
        </div>
        <div class="min-w-0 flex flex-wrap items-center gap-2">
          <BaseButton :disabled="!resource.data.value?.hasClaimableReward || resource.busy.value || resource.loading.value" :loading="resource.busy.value" @click="pending = { action: 'claimIllustrated' }">
            领取图鉴奖励
          </BaseButton>
          <BaseButton class="w-24" variant="primary" :loading="resource.loading.value" :disabled="resource.busy.value" @click="resource.refresh">
            刷新
          </BaseButton>
        </div>
      </div>

      <SceneTabs v-model="kind" class="mb-4" :tabs="[{ value: 'normal', label: '普通图鉴' }, { value: 'giant', label: '巨大图鉴' }]" />
      <div class="ranch-illustrated-toolbar mb-4">
        <SceneTabs v-model="tab" :tabs="[{ value: 'all', label: '全部' }, { value: 'unlocked', label: '已解锁' }, { value: 'locked', label: '未解锁' }]" />
        <input v-model="query" class="border rounded-lg bg-transparent px-3 py-2" aria-label="搜索图鉴动物或 ID" placeholder="搜索动物或 ID">
      </div>

      <div v-if="!list.length" class="ui-card rounded-lg p-8 text-center text-gray-500">
        {{ resource.loading.value ? '正在加载牧场图鉴…' : '暂无图鉴记录' }}
      </div>
      <div v-else class="ranch-illustrated-grid">
        <article v-for="entry in list" :key="`${entry.fruitId}-${entry.rarity}`" class="ranch-book-entry">
          <div class="ranch-book-entry-media">
            <span class="ranch-book-entry-id">#{{ entry.fruitId }}</span>
            <span class="ranch-book-entry-badge" :class="entry.unlocked ? 'is-unlocked' : 'is-locked'">{{ entry.unlocked ? '已解锁' : '未解锁' }}</span>
            <img v-if="entry.image" :src="entry.image" :alt="entry.name" class="ranch-book-entry-img">
            <span v-else class="ranch-book-entry-fallback">{{ String(entry.name || '?').slice(0, 1) }}</span>
          </div>
          <div class="ranch-book-entry-body">
            <h2>{{ entry.name || `动物/产物 ${entry.fruitId}` }}</h2>
            <p class="ranch-book-entry-progress">
              {{ entry.unlocked ? '已解锁' : '未解锁' }}<template v-if="!isGiant">
                · 进度 {{ entry.progress ?? '—' }}
              </template>
            </p>
            <p v-if="entry.giant?.unlocked" class="ranch-book-entry-weight">
              {{ weightText(entry.giant) }}
            </p>
            <p v-else class="ranch-book-entry-weight is-empty">
              暂无重量记录
            </p>
          </div>
        </article>
      </div>

      <div v-if="resource.data.value?.errors && Object.keys(resource.data.value.errors).length" class="mt-3 text-sm text-amber-600">
        部分图鉴分区读取失败：{{ Object.values(resource.data.value.errors).join('；') }}
      </div>
    </div>

    <div class="grid items-start gap-3 md:grid-cols-2">
      <article class="ui-card rounded-lg p-4">
        <div class="mb-2 flex items-center justify-between gap-2">
          <h2 class="font-semibold">
            图鉴等级奖励
          </h2>
          <span class="text-xs text-gray-500">共 {{ levelRewards.length }} 档</span>
        </div>
        <ul class="space-y-1.5">
          <li v-for="level in levelRewards" :key="level.level" class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white/45 px-2.5 py-1.5 text-xs dark:bg-white/10">
            <span class="font-semibold">Lv.{{ level.level }}</span>
            <span class="text-gray-500">进度 {{ level.pointCondition }}</span>
            <span class="rounded px-1.5 py-0.5 text-[11px] font-semibold" :class="statusClass(level)">{{ statusLabel(level) }}</span>
            <span class="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">{{ rewardText(level.rewards) || '无奖励配置' }}</span>
          </li>
        </ul>
      </article>
      <article class="ui-card rounded-lg p-4">
        <div class="mb-2 flex items-center justify-between gap-2">
          <h2 class="font-semibold">
            重量积分奖励
          </h2>
          <span class="text-xs text-gray-500">共 {{ weightRewards.length }} 档</span>
        </div>
        <ul class="space-y-1.5">
          <li v-for="level in weightRewards" :key="level.id" class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white/45 px-2.5 py-1.5 text-xs dark:bg-white/10">
            <span class="font-semibold">积分 {{ level.scoreCondition }}</span>
            <span class="rounded px-1.5 py-0.5 text-[11px] font-semibold" :class="statusClass(level)">{{ statusLabel(level) }}</span>
            <span class="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">{{ rewardText(level.rewards) || '无奖励配置' }}</span>
            <BaseButton v-if="!level.claimed" size="sm" class="shrink-0" :disabled="!level.canClaim || resource.busy.value || resource.loading.value" @click="pending = { action: 'claimWeight', id: level.id }">
              领取
            </BaseButton>
          </li>
        </ul>
      </article>
    </div>
    <p v-if="resource.data.value?.weightScore?.totalScore != null" class="text-xs text-gray-500">
      当前重量积分 {{ formatCouponAmount(String(resource.data.value.weightScore.totalScore)) }}，达到下一档积分即可领取对应奖励。
    </p>
    <ConfirmModal :show="!!pending" title="领取牧场奖励" message="确认领取当前满足条件的奖励？" :loading="resource.busy.value" @confirm="claim" @cancel="pending = null" @close="pending = null" />
  </RanchPageShell>
</template>
