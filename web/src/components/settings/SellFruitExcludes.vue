<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import api from '@/api'

interface Fruit {
  id: number
  name: string
  image: string
  count: number
  price: number
  priceUnit: string
  inBag: boolean
}

type SourceFilter = 'all' | 'bag' | 'catalog'

const props = defineProps<{ accountId: string | number }>()
const excludes = defineModel<number[]>({ required: true })

const sourceTabs: Array<{ value: SourceFilter, label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'bag', label: '背包' },
  { value: 'catalog', label: '图鉴' },
]

const source = ref<SourceFilter>('all')
const fruits = ref<Fruit[]>([])
const loading = ref(false)
const error = ref('')
const bagError = ref('')
const search = ref('')
const expanded = ref(false)
// 本账号作物图鉴中已解锁的果实 ID（/api/illustrated 的 seedId 字段实为果实 ID），用于优先展示与「未解锁」标记
const unlockedFruitIds = ref<Set<number>>(new Set())
let requestId = 0

const excludeSet = computed(() => new Set(excludes.value.map(Number)))

function isUnlocked(fruit: Fruit) {
  return fruit.inBag || unlockedFruitIds.value.has(fruit.id)
}

// 已选（不卖）置顶：toggle 维护模型为「最新选中在前」，此处按模型顺序排列；
// 其余按「图鉴已解锁优先」分组，组内保持接口返回顺序（ID 升序）
const ordered = computed(() => {
  const byId = new Map(fruits.value.map(fruit => [fruit.id, fruit]))
  const selected = excludes.value
    .map(id => byId.get(Number(id)))
    .filter((fruit): fruit is Fruit => !!fruit)
  const rest = fruits.value.filter(fruit => !excludeSet.value.has(fruit.id))
  const unlocked = rest.filter(fruit => isUnlocked(fruit))
  const locked = rest.filter(fruit => !isUnlocked(fruit))
  return [...selected, ...unlocked, ...locked]
})

const visibleFruits = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query)
    return ordered.value
  return ordered.value.filter(fruit =>
    fruit.name.toLocaleLowerCase().includes(query) || String(fruit.id).includes(query),
  )
})

async function refresh() {
  if (!props.accountId)
    return
  const request = ++requestId
  loading.value = true
  error.value = ''
  bagError.value = ''
  try {
    const res = await api.get('/api/bag/fruits', {
      params: { source: source.value },
      headers: { 'x-account-id': props.accountId },
    })
    if (request !== requestId)
      return
    if (!res.data.ok)
      throw new Error(res.data.error || '读取果实列表失败')
    fruits.value = Array.isArray(res.data.data?.fruits) ? res.data.data.fruits : []
    bagError.value = String(res.data.data?.bagError || '')
  }
  catch (e) {
    if (request === requestId)
      error.value = e instanceof Error ? e.message : '读取果实列表失败'
  }
  finally {
    if (request === requestId)
      loading.value = false
  }
}

// 拉取本账号作物图鉴的已解锁果实，失败静默降级（不影响列表展示，仅失去优先排序与准确解锁标记）
async function fetchUnlocked() {
  if (!props.accountId)
    return
  try {
    const res = await api.get('/api/illustrated', {
      params: { illustrated_type: 1 },
      headers: { 'x-account-id': props.accountId },
    })
    const items = Array.isArray(res.data?.data?.items) ? res.data.data.items : []
    unlockedFruitIds.value = new Set(
      items.filter((item: any) => item && item.unlocked).map((item: any) => Number(item.seedId)),
    )
  }
  catch {
    unlockedFruitIds.value = new Set()
  }
}

function toggle(id: number) {
  const list = excludes.value.map(Number)
  excludes.value = list.includes(id)
    ? list.filter(item => item !== id)
    : [id, ...list]
}

watch(() => props.accountId, () => {
  fruits.value = []
  search.value = ''
  unlockedFruitIds.value = new Set()
  void fetchUnlocked()
  void refresh()
}, { immediate: true })

watch(source, () => {
  void refresh()
})

watch(expanded, (value) => {
  if (value && !fruits.value.length && !loading.value)
    void refresh()
})
</script>

<template>
  <section class="border border-gray-200/90 rounded-xl bg-white/55 p-2.5 dark:border-gray-700">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <button type="button" class="min-h-8 flex items-center gap-2 text-sm font-medium" :aria-expanded="expanded" @click="expanded = !expanded">
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3 w-3 transition-transform" :class="{ 'rotate-90': expanded }"><path d="m6 3 5 5-5 5" /></svg>
        不卖果实白名单
        <span class="text-xs text-gray-500 font-normal">{{ loading ? '读取中…' : error ? '读取失败' : `共 ${fruits.length} 种 · 已选 ${excludes.length} 种不卖` }}</span>
      </button>
      <div v-if="expanded" class="ml-auto flex flex-wrap items-center gap-2">
        <div class="h-8 inline-flex overflow-hidden border border-gray-200 rounded-md bg-white p-0.5 dark:border-gray-600 dark:bg-gray-800">
          <button
            v-for="tab in sourceTabs"
            :key="tab.value"
            type="button"
            class="min-w-12 rounded px-2 text-xs font-medium transition"
            :class="source === tab.value ? 'text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'"
            :style="source === tab.value ? { backgroundColor: 'var(--theme-primary)' } : {}"
            @click="source = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>
        <input v-model="search" type="search" aria-label="搜索果实" placeholder="搜索名称 / ID" class="h-8 w-32 border border-gray-200 rounded-md bg-transparent px-2 text-xs outline-none focus:border-[var(--theme-primary)] sm:w-40 dark:border-gray-600">
        <button type="button" class="h-8 shrink-0 text-xs text-[var(--theme-primary)] disabled:opacity-50" :disabled="loading" @click="refresh">
          {{ loading ? '读取中…' : '刷新' }}
        </button>
        <span tabindex="0" aria-label="点击果实卡片加入不卖白名单，选中的果实会框起来并置顶，自动出售时跳过；图鉴已解锁的果实优先显示在前，未解锁的果实也可以提前加入名单。保存设置后生效。" title="点击果实卡片加入不卖白名单，选中的果实会框起来并置顶，自动出售时跳过；图鉴已解锁的果实优先显示在前，未解锁的果实也可以提前加入名单。保存设置后生效。" class="i-carbon-information h-4 w-4 shrink-0 text-gray-400" />
      </div>
    </div>
    <div v-show="expanded" class="mt-2">
      <p v-if="error" role="alert" class="text-sm text-red-500">
        {{ error }}
      </p>
      <p v-else-if="loading" class="py-4 text-center text-sm text-gray-500">
        正在读取果实列表…
      </p>
      <template v-else>
        <p v-if="bagError" class="mb-2 text-xs text-amber-600 dark:text-amber-400">
          背包数据读取失败（{{ bagError }}），当前仅显示图鉴目录。
        </p>
        <p v-if="!visibleFruits.length" class="py-6 text-center text-sm text-gray-500">
          {{ fruits.length ? '没有匹配的果实' : '暂无果实数据' }}
        </p>
        <div v-else class="max-h-96 overflow-y-auto overscroll-contain px-1 py-1">
          <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,7rem),1fr))] gap-2">
            <button
              v-for="fruit in visibleFruits"
              :key="fruit.id"
              type="button"
              class="relative min-w-0 cursor-pointer select-none border rounded-lg bg-gray-50 p-2 text-left transition hover:border-gray-300 dark:bg-gray-800 dark:hover:border-gray-600"
              :class="excludeSet.has(fruit.id)
                ? 'border-[var(--theme-primary)] ring-2 ring-[color-mix(in_srgb,var(--theme-primary)_35%,transparent)]'
                : 'border-gray-200 dark:border-gray-700'"
              :aria-pressed="excludeSet.has(fruit.id)"
              :aria-label="`${fruit.name}，${excludeSet.has(fruit.id) ? '已在不卖白名单，点击移除' : '点击加入不卖白名单'}`"
              :title="excludeSet.has(fruit.id) ? '点击移出不卖白名单' : '点击加入不卖白名单'"
              @click="toggle(fruit.id)"
            >
              <div class="flex items-center justify-end gap-1">
                <span
                  v-if="excludeSet.has(fruit.id)"
                  class="rounded px-1 py-0.5 text-[10px] text-white font-medium leading-none"
                  :style="{ backgroundColor: 'var(--theme-primary)' }"
                >不卖</span>
                <span
                  v-else-if="!isUnlocked(fruit)"
                  class="rounded bg-gray-200 px-1 py-0.5 text-[10px] text-gray-500 font-medium leading-none dark:bg-gray-700 dark:text-gray-400"
                >未解锁</span>
              </div>
              <div class="flex flex-col items-center gap-1 pb-1">
                <div class="grid h-10 w-10 place-items-center">
                  <img v-if="fruit.image" :src="fruit.image" alt="" class="h-10 w-10 object-contain" draggable="false">
                  <span v-else class="i-carbon-apple text-2xl text-gray-400" />
                </div>
                <div class="w-full truncate text-center text-sm font-medium" :title="fruit.name">
                  {{ fruit.name }}
                </div>
                <template v-if="fruit.inBag">
                  <span class="text-xs text-gray-500">库存 {{ fruit.count }}</span>
                  <span class="text-xs text-gray-500">售价 {{ fruit.price }} {{ fruit.priceUnit }}</span>
                </template>
              </div>
            </button>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
