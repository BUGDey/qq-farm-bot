<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountStore } from '@/stores/account'
import { useCollectionsStore } from '@/stores/collections'

const accountStore = useAccountStore()
const collectionsStore = useCollectionsStore()
const { currentAccountId } = storeToRefs(accountStore)
const { snapshot, loading, error } = storeToRefs(collectionsStore)

const seriesList = computed(() => snapshot.value.series || [])
const pedestals = computed(() => (snapshot.value.pedestals || []).filter(row => row.owned))
const displayName = computed(() => {
  const display = snapshot.value.display
  if (!display)
    return ''
  for (const series of seriesList.value) {
    const hit = series.items.find(item => String(item.id) === String(display.itemId))
    if (hit)
      return hit.name
  }
  return `藏品${display.itemId}`
})

const progressPercent = computed(() => {
  const total = Number(snapshot.value.totalCount) || 0
  if (!total)
    return 0
  return Math.min(100, Math.round((Number(snapshot.value.activatedCount) || 0) / total * 100))
})

function rarityClass(rarity: number) {
  if (rarity >= 4)
    return 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
  if (rarity === 3)
    return 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300'
  if (rarity === 2)
    return 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
}

function starText(item: { starLevel: number, maxStarLevel: number }) {
  return `${item.starLevel}/${item.maxStarLevel}`
}

async function reload() {
  await collectionsStore.fetchSnapshot(currentAccountId.value)
}

onMounted(reload)
watch(currentAccountId, () => reload())
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 flex items-center justify-center rounded-xl from-sky-400 to-blue-600 bg-gradient-to-br text-white">
            <div class="i-carbon-cube text-xl" />
          </div>
          <div>
            <h2 class="text-base font-bold">
              蓝晶藏品
            </h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              已激活 {{ snapshot.activatedCount }}/{{ snapshot.totalCount }} 件 · 藏品积分 {{ snapshot.score }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="h-8 flex items-center rounded-lg bg-emerald-50 px-3 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
            下一档 {{ snapshot.nextRewardScore ?? '--' }}
          </span>
          <BaseButton variant="secondary" :loading="loading" @click="reload">
            刷新
          </BaseButton>
        </div>
      </div>

      <div class="mt-4 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
        <div class="h-full rounded-full from-sky-400 to-blue-600 bg-gradient-to-r transition-all" :style="{ width: `${progressPercent}%` }" />
      </div>

      <div v-if="snapshot.currentBuffs.length" class="mt-3 flex flex-wrap gap-2">
        <span
          v-for="buff in snapshot.currentBuffs"
          :key="buff.key"
          class="rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
          :title="buff.description"
        >
          {{ buff.name }} +{{ buff.value }}%
        </span>
      </div>

      <p v-if="displayName" class="mt-3 text-xs text-gray-500 dark:text-gray-400">
        珍藏室正在陈列：<span class="text-gray-700 font-medium dark:text-gray-200">{{ displayName }}</span>
      </p>
    </div>

    <div v-if="!currentAccountId" class="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
      请先选择账号，再查看藏品。
    </div>

    <div v-else-if="error" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
      {{ error }}
    </div>

    <div v-else-if="loading && !seriesList.length" class="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
      正在加载藏品...
    </div>

    <div v-else-if="!seriesList.length" class="border border-gray-200 rounded-lg border-dashed bg-white px-6 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-400">
      暂无可展示的藏品系列
    </div>

    <div v-else class="space-y-4">
      <div v-for="series in seriesList" :key="series.id" class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-sm font-bold">
              {{ series.name }}
            </h3>
            <span class="rounded px-2 py-0.5 text-xs" :class="rarityClass(series.rarity)">
              {{ series.rarityName }}
            </span>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {{ series.activatedCount }}/{{ series.totalCount }}
            </span>
          </div>
          <span v-if="series.activatedCount >= series.totalCount" class="text-xs text-emerald-600 dark:text-emerald-400">
            已集齐
          </span>
        </div>

        <p v-if="series.description" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {{ series.description }}
        </p>

        <div class="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] mt-3 gap-2">
          <div
            v-for="item in series.items"
            :key="item.id"
            class="relative flex flex-col items-center gap-1 border border-gray-100 rounded-lg bg-gray-50 p-2 text-center dark:border-gray-700 dark:bg-gray-900/40"
            :class="item.activated ? 'border-emerald-200 dark:border-emerald-800' : ''"
            :title="item.description"
          >
            <span
              v-if="item.isNew"
              class="absolute right-1 top-1 rounded bg-red-500 px-1 text-[10px] text-white leading-4"
            >新</span>
            <span
              v-if="item.displayed"
              class="absolute left-1 top-1 rounded bg-sky-500 px-1 text-[10px] text-white leading-4"
            >陈列</span>
            <img
              v-if="item.image"
              :src="item.image"
              :alt="item.name"
              class="h-12 w-12 object-contain"
              :class="item.activated ? '' : 'opacity-40 grayscale'"
              loading="lazy"
            >
            <div v-else class="h-12 w-12 flex items-center justify-center rounded bg-white text-gray-300 dark:bg-gray-800">
              <div class="i-carbon-image" />
            </div>
            <span class="w-full truncate text-xs font-medium">
              {{ item.name }}
            </span>
            <span class="text-[11px] text-amber-600 dark:text-amber-400">
              {{ starText(item) }} 星
            </span>
            <span v-if="item.requirements.length" class="w-full truncate text-[10px] text-gray-400" :title="item.requirements.join('\n')">
              {{ item.requirements[0] }}
            </span>
          </div>
        </div>
      </div>

      <div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
        <h3 class="text-sm font-bold">
          藏品积分奖励
        </h3>
        <div class="mt-3 space-y-2">
          <div
            v-for="milestone in snapshot.milestones"
            :key="milestone.level"
            class="flex flex-wrap items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 text-xs dark:border-gray-700"
            :class="milestone.claimed ? 'bg-emerald-50/60 dark:bg-emerald-900/10' : ''"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">
                {{ milestone.score }} 分
              </span>
              <span
                v-for="reward in milestone.rewards"
                :key="`${milestone.level}-${reward.itemId}`"
                class="rounded bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              >
                {{ reward.name }} ×{{ reward.count }}
              </span>
            </div>
            <span :class="milestone.claimed ? 'text-emerald-600 dark:text-emerald-400' : milestone.reached ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'">
              {{ milestone.claimed ? '已领取' : milestone.reached ? '可领取' : '未达成' }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="pedestals.length" class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
        <h3 class="text-sm font-bold">
          已有展台
        </h3>
        <div class="mt-3 flex flex-wrap gap-2">
          <div
            v-for="pedestal in pedestals"
            :key="pedestal.id"
            class="flex items-center gap-2 border border-gray-100 rounded-lg px-2 py-1 text-xs dark:border-gray-700"
          >
            <img v-if="pedestal.image" :src="pedestal.image" :alt="pedestal.name" class="h-6 w-6 object-contain" loading="lazy">
            <span>{{ pedestal.name }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
