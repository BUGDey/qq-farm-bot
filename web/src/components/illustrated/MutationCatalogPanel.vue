<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useCollectionsStore } from '@/stores/collections'

const collectionsStore = useCollectionsStore()
const { catalog, catalogLoading, catalogError } = storeToRefs(collectionsStore)

const groups = computed(() => [
  {
    key: 'normal',
    title: '常规变异',
    hint: '普通/稀有作物生长过程中随机出现',
    entries: catalog.value.normal.map(row => ({
      id: `n-${row.id}`,
      name: row.name,
      tag: row.tag,
      image: row.image,
      effect: row.effect,
      description: row.description,
      probabilities: row.probabilities,
    })),
  },
  {
    key: 'decoration',
    title: '装扮变异',
    hint: '特定作物或装扮玩法触发',
    entries: catalog.value.decoration.map(row => ({
      id: `d-${row.id}`,
      name: row.name,
      tag: row.tag,
      image: row.image,
      effect: row.effect,
      description: row.description,
      probabilities: row.probabilities,
    })),
  },
])

const collectionSeries = computed(() => catalog.value.collections || [])

function rarityLabel(rarity: number) {
  if (rarity >= 4)
    return '天工'
  if (rarity === 3)
    return '珍品'
  if (rarity === 2)
    return '稀有'
  return '普通'
}

function rarityClass(rarity: number) {
  if (rarity >= 4)
    return 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
  if (rarity === 3)
    return 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300'
  if (rarity === 2)
    return 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
}

onMounted(() => collectionsStore.fetchMutationCatalog())
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 flex items-center justify-center rounded-xl from-fuchsia-500 to-purple-600 bg-gradient-to-br text-white">
          <div class="i-carbon-chemistry text-xl" />
        </div>
        <div>
          <h2 class="text-base font-bold">
            变异宝典
          </h2>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            读取官方变异配置与概率公示，无需账号在线；概率来自游戏内公示，实际以官方为准。
          </p>
        </div>
      </div>
    </div>

    <div v-if="catalogError" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
      {{ catalogError }}
    </div>

    <div v-else-if="catalogLoading && !catalog.normal.length" class="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
      正在加载变异宝典...
    </div>

    <template v-else>
      <div v-for="group in groups" :key="group.key" class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="text-sm font-bold">
            {{ group.title }}
          </h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ group.hint }} · 共 {{ group.entries.length }} 种
          </span>
        </div>

        <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] mt-3 gap-2">
          <div
            v-for="entry in group.entries"
            :key="entry.id"
            class="flex gap-2 border border-gray-100 rounded-lg bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900/40"
          >
            <img v-if="entry.image" :src="entry.image" :alt="entry.name" class="h-12 w-12 shrink-0 object-contain" loading="lazy">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1">
                <span class="truncate text-xs font-semibold">{{ entry.name }}</span>
                <span v-if="entry.tag && entry.tag !== '无'" class="rounded bg-white px-1 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">{{ entry.tag }}</span>
              </div>
              <p class="truncate text-[11px] text-emerald-600 dark:text-emerald-400" :title="entry.effect">
                {{ entry.effect }}
              </p>
              <div class="mt-1 flex flex-wrap gap-1">
                <span
                  v-for="prob in entry.probabilities"
                  :key="`${entry.id}-${prob.rarity}`"
                  class="rounded px-1.5 py-0.5 text-[10px]"
                  :class="rarityClass(prob.rarity)"
                >
                  {{ rarityLabel(prob.rarity) }} {{ prob.percent }}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="text-sm font-bold">
            藏品变异
          </h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            按系列区分：概率随作物时长变化，保底次数为官方公示值
          </span>
        </div>

        <div class="mt-3 space-y-3">
          <div
            v-for="series in collectionSeries"
            :key="series.id"
            class="border border-gray-100 rounded-lg p-3 dark:border-gray-700"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold">{{ series.name }}</span>
              <span class="rounded px-2 py-0.5 text-xs" :class="rarityClass(4)">{{ series.rarityName }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ series.description }}</span>
            </div>

            <div class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="rule in series.mutationRules"
                :key="`${series.id}-${rule.name}`"
                class="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              >
                {{ rule.name }} · {{ rule.probability }}% · 保底 {{ rule.guarantee }} 次
              </span>
            </div>

            <div class="mt-2 flex flex-wrap gap-2">
              <div
                v-for="item in series.items"
                :key="item.id"
                class="w-20 flex flex-col items-center gap-0.5 rounded-lg bg-gray-50 p-1 text-center dark:bg-gray-900/40"
              >
                <img v-if="item.image" :src="item.image" :alt="item.name" class="h-10 w-10 object-contain" loading="lazy">
                <span class="w-full truncate text-[11px]">{{ item.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
