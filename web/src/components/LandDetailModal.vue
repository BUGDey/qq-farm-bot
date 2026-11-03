<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  land: any
  player: any
  connected: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const info = computed(() => props.land?.landInfo)

const metrics = [
  { key: 'yieldBonus', label: '产量加成', unit: '%' },
  { key: 'growthReduction', label: '成长提速', unit: '%' },
  { key: 'expBonus', label: '经验加成', unit: '%' },
  { key: 'mutantMultiplier', label: '变异概率', unit: '倍' },
  { key: 'resonanceBonus', label: '共鸣加成', unit: '%' },
]

function metric(level: any, key: string, unit: string) {
  if (!level)
    return '—'
  const value = Number(level[key]) || 0
  return key === 'mutantMultiplier' && !value ? '无' : `${value}${unit}`
}

function integer(value: unknown) {
  const text = String(value ?? '')
  return /^\d+$/.test(text) ? BigInt(text) : null
}

function better(next: any, current: any, key: string) {
  return Number(next?.[key]) > Number(current?.[key])
}

const balances = computed<Record<string, unknown>>(() => ({
  1001: props.player?.gold,
  1002: props.player?.coupon,
  1005: props.player?.goldBean,
}))

const costs = computed(() => (info.value?.costs || []).map((cost: any) => {
  const balance = props.connected ? integer(balances.value[cost.id]) : null
  const required = integer(cost.count) ?? BigInt(0)
  return {
    ...cost,
    available: balance,
    missing: balance === null ? null : required > balance ? required - balance : BigInt(0),
  }
}))

const levelMet = computed(() => props.connected && Number(props.player?.level) >= Number(info.value?.needLevel))

function format(value: unknown) {
  const parsed = integer(value)
  return parsed === null ? '—' : parsed.toLocaleString('zh-CN')
}

function close() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm"
      @click.self="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="土地详情"
        class="max-h-[calc(100dvh-32px)] w-[min(480px,calc(100vw-24px))] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-800"
      >
        <div class="mb-3 flex items-start justify-between gap-3">
          <h3 class="text-base text-gray-800 font-bold dark:text-gray-100">
            土地详情 <span class="text-sm text-gray-400 font-normal">#{{ land?.id }}</span>
          </h3>
          <button
            class="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
            aria-label="关闭"
            @click="close"
          >
            <div class="i-carbon-close text-lg" />
          </button>
        </div>

        <template v-if="info">
          <!-- 等级对比 -->
          <div
            class="mb-4 flex items-center justify-center gap-3 pb-4"
            :class="info.next && info.current ? 'justify-between' : ''"
          >
            <div v-if="info.current" class="flex flex-1 flex-col items-center gap-2">
              <img :src="info.current.image" :alt="info.current.name" class="h-[70px] w-[84px] object-contain">
              <strong class="text-sm text-gray-700 dark:text-gray-200">{{ info.current.name }}</strong>
            </div>
            <div v-if="info.next && info.current" class="i-carbon-chevron-right text-2xl text-gray-300" />
            <div v-if="info.next" class="flex flex-1 flex-col items-center gap-2">
              <img :src="info.next.image" :alt="info.next.name" class="h-[70px] w-[84px] object-contain">
              <strong class="text-sm text-gray-700 dark:text-gray-200">{{ info.next.name }}</strong>
            </div>
          </div>

          <!-- 加成表 -->
          <table class="w-full border-collapse text-sm tabular-nums">
            <thead class="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-600">
              <tr>
                <th class="py-2 text-left font-medium">
                  土地加成
                </th>
                <th class="py-2 text-right font-medium">
                  {{ info.current ? '当前' : '解锁后' }}
                </th>
                <th v-if="info.current && info.next" class="py-2 text-right font-medium">
                  升级后
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in metrics" :key="row.key" class="border-b border-gray-100 last:border-0 dark:border-gray-700/50">
                <th class="py-2 text-left text-gray-600 font-normal dark:text-gray-300">
                  {{ row.label }}
                </th>
                <td class="py-2 text-right text-gray-700 dark:text-gray-200">
                  {{ metric(info.current || info.next, row.key, row.unit) }}
                </td>
                <td
                  v-if="info.current && info.next"
                  class="py-2 text-right text-gray-700 dark:text-gray-200"
                  :class="{ 'text-green-600 font-medium dark:text-green-400': better(info.next, info.current, row.key) }"
                >
                  {{ metric(info.next, row.key, row.unit) }}<span v-if="better(info.next, info.current, row.key)"> ↑</span>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="info.mode === 'max'" class="mt-5 rounded-xl bg-green-50 p-2.5 text-center text-sm text-green-700 font-medium dark:bg-green-900/20 dark:text-green-400">
            当前已满级
          </div>

          <section v-else class="mt-4 border-t border-gray-200 pt-4 dark:border-gray-600">
            <h4 class="mb-3 text-gray-800 font-bold dark:text-gray-100">
              {{ info.mode === 'unlock' ? '解锁条件' : '升级条件' }}
            </h4>

            <div v-if="info.needLevel !== null" class="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
              <span class="text-gray-600 dark:text-gray-300">种植等级达到 {{ info.needLevel }} 级</span>
              <strong :class="levelMet ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'">
                {{ connected ? player?.level ?? '—' : '—' }} / {{ info.needLevel }}
              </strong>
            </div>

            <div v-if="info.prerequisite" class="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
              <span class="text-gray-600 dark:text-gray-300">解锁第 {{ info.prerequisite.landId }} 块土地</span>
              <strong :class="info.prerequisite.met ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'">
                {{ info.prerequisite.met ? '已满足' : '未满足' }}
              </strong>
            </div>

            <div v-if="info.precedingLands" class="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
              <span class="text-gray-600 dark:text-gray-300">{{ info.precedingLands.name }}及以上达到 {{ info.precedingLands.required }} 块</span>
              <strong :class="info.precedingLands.met === true ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'">
                {{ info.precedingLands.owned ?? '—' }} / {{ info.precedingLands.required }}
              </strong>
            </div>

            <div v-if="info.current && info.next" class="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
              <span class="text-gray-600 dark:text-gray-300">当前地块为{{ info.current.name }}</span>
              <span class="text-green-600 dark:text-green-400">已满足</span>
            </div>

            <div v-for="cost in costs" :key="cost.id" class="mt-3 flex items-center justify-between gap-3">
              <div class="min-w-0 flex items-center gap-2.5">
                <img v-if="cost.image" :src="cost.image" alt="" class="size-7 object-contain">
                <div v-else class="size-7 rounded bg-gray-100 dark:bg-gray-700" />
                <span class="truncate text-sm text-gray-700 dark:text-gray-200">{{ cost.name }}</span>
              </div>
              <div class="flex flex-col items-end tabular-nums">
                <strong class="text-sm text-gray-800 dark:text-gray-100">{{ format(cost.count) }}</strong>
                <span
                  class="text-xs"
                  :class="cost.missing === BigInt(0) ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'"
                >
                  {{ cost.missing === null ? '余额待同步' : cost.missing > BigInt(0) ? `还差 ${format(cost.missing)}` : '余额充足' }}
                </span>
              </div>
            </div>

            <p v-if="info.unknown" class="mt-3 text-xs text-orange-600 dark:text-orange-400">
              部分条件暂未获取
            </p>
            <p v-else-if="info.serverAllowed && connected" class="mt-3 text-sm text-green-600 dark:text-green-400">
              当前可{{ info.mode === 'unlock' ? '解锁' : '升级' }}
            </p>
          </section>
        </template>

        <p v-else class="text-sm text-gray-500">
          土地详情暂未获取，请刷新农场。
        </p>
      </div>
    </div>
  </Teleport>
</template>
