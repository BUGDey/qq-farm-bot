<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import api from '@/api'

interface Seed {
  seedId: number
  name: string
  count: number
  image?: string
  requiredLevel?: number
}

const props = defineProps<{ accountId: string | number }>()
const blocklist = defineModel<number[]>({ required: true })

const seeds = ref<Seed[]>([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const expanded = ref(false)
let requestId = 0

const blockSet = computed(() => new Set(blocklist.value.map(Number)))

// 已加入名单的置顶（保持模型顺序），其余按接口返回顺序
const ordered = computed(() => {
  const byId = new Map(seeds.value.map(seed => [seed.seedId, seed]))
  const selected = blocklist.value
    .map(id => byId.get(Number(id)))
    .filter((seed): seed is Seed => !!seed)
  const rest = seeds.value.filter(seed => !blockSet.value.has(seed.seedId))
  return [...selected, ...rest]
})

const visibleSeeds = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query)
    return ordered.value
  return ordered.value.filter(seed =>
    seed.name.toLocaleLowerCase().includes(query) || String(seed.seedId).includes(query),
  )
})

async function refresh() {
  if (!props.accountId)
    return
  const request = ++requestId
  loading.value = true
  error.value = ''
  try {
    const res = await api.get('/api/bag/seeds', { headers: { 'x-account-id': props.accountId } })
    if (request !== requestId)
      return
    if (!res.data.ok)
      throw new Error(res.data.error || '读取背包种子失败')
    seeds.value = Array.isArray(res.data.data?.seeds) ? res.data.data.seeds : []
  }
  catch (e) {
    if (request === requestId)
      error.value = e instanceof Error ? e.message : '读取背包种子失败'
  }
  finally {
    if (request === requestId)
      loading.value = false
  }
}

function toggle(seedId: number) {
  const list = blocklist.value.map(Number)
  blocklist.value = list.includes(seedId)
    ? list.filter(item => item !== seedId)
    : [seedId, ...list]
}

watch(() => props.accountId, () => {
  seeds.value = []
  search.value = ''
  void refresh()
}, { immediate: true })

watch(expanded, (value) => {
  if (value && !seeds.value.length && !loading.value)
    void refresh()
})
</script>

<template>
  <section class="border border-gray-200/90 rounded-xl bg-white/55 p-2.5 dark:border-gray-700">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <button type="button" class="min-h-8 flex items-center gap-2 text-sm font-medium" :aria-expanded="expanded" @click="expanded = !expanded">
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3 w-3 transition-transform" :class="{ 'rotate-90': expanded }"><path d="m6 3 5 5-5 5" /></svg>
        不种植名单
        <span class="text-xs text-gray-500 font-normal">{{ loading ? '读取中…' : error ? '读取失败' : `共 ${seeds.length} 种 · 已选 ${blocklist.length} 种不种` }}</span>
      </button>
      <div v-if="expanded" class="ml-auto flex items-center gap-2">
        <input v-model="search" type="search" aria-label="搜索种子" placeholder="搜索名称 / ID" class="h-8 w-36 border border-gray-200 rounded-md bg-transparent px-2 text-xs outline-none sm:w-44 dark:border-gray-600 focus:border-[var(--theme-primary)]">
        <button type="button" class="h-8 shrink-0 text-xs text-[var(--theme-primary)] disabled:opacity-50" :disabled="loading" @click="refresh">
          {{ loading ? '读取中…' : '刷新' }}
        </button>
        <span tabindex="0" aria-label="点击种子卡片加入不种植名单，选中的种子会框起来并置顶；名单内的种子无论使用哪种种植策略都不会被种下，也不参与自动购种。与背包种植优先级相互独立。保存设置后生效。" title="点击种子卡片加入不种植名单，选中的种子会框起来并置顶；名单内的种子无论使用哪种种植策略都不会被种下，也不参与自动购种。与背包种植优先级相互独立。保存设置后生效。" class="i-carbon-information h-4 w-4 shrink-0 text-gray-400" />
      </div>
    </div>
    <div v-show="expanded" class="mt-2">
      <p v-if="error" role="alert" class="text-sm text-red-500">
        {{ error }}
      </p>
      <p v-else-if="loading" class="py-4 text-center text-sm text-gray-500">
        正在读取背包种子…
      </p>
      <p v-else-if="!visibleSeeds.length" class="py-6 text-center text-sm text-gray-500">
        {{ seeds.length ? '没有匹配的种子' : '暂无种子数据' }}
      </p>
      <div v-else class="max-h-96 overflow-y-auto overscroll-contain px-1 py-1">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,7rem),1fr))] gap-2">
          <button
            v-for="seed in visibleSeeds"
            :key="seed.seedId"
            type="button"
            class="relative min-w-0 cursor-pointer select-none border rounded-lg bg-gray-50 p-2 text-left transition hover:border-gray-300 dark:bg-gray-800 dark:hover:border-gray-600"
            :class="blockSet.has(seed.seedId)
              ? 'border-[var(--theme-primary)] ring-2 ring-[color-mix(in_srgb,var(--theme-primary)_35%,transparent)]'
              : 'border-gray-200 dark:border-gray-700'"
            :aria-pressed="blockSet.has(seed.seedId)"
            :aria-label="`${seed.name}，${blockSet.has(seed.seedId) ? '已在不种植名单，点击移除' : '点击加入不种植名单'}`"
            :title="blockSet.has(seed.seedId) ? '点击移出不种植名单' : '点击加入不种植名单'"
            @click="toggle(seed.seedId)"
          >
            <div class="flex items-center justify-end gap-1">
              <span
                v-if="blockSet.has(seed.seedId)"
                class="rounded px-1 py-0.5 text-[10px] text-white font-medium leading-none"
                :style="{ backgroundColor: 'var(--theme-primary)' }"
              >不种</span>
            </div>
            <div class="flex flex-col items-center gap-1 pb-1">
              <div class="grid h-10 w-10 place-items-center">
                <img v-if="seed.image" :src="seed.image" alt="" class="h-10 w-10 object-contain" draggable="false">
                <span v-else class="i-carbon-sprout text-2xl text-gray-400" />
              </div>
              <div class="w-full truncate text-center text-sm font-medium" :title="seed.name">
                {{ seed.name }}
              </div>
              <span class="text-xs text-gray-500">库存 {{ seed.count }}</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
