<script setup lang="ts">
import { computed, ref } from 'vue'

interface ExchangeGoods {
  goodsId: string | number
  name?: string
  itemCount?: string | number
  costItemId?: string | number
  costCount?: string | number
  effectiveCostCount?: string | number
  limitCount?: string | number
  limitUsed?: string | number
  discountPrice?: string | number
  discountStartTime?: string | number
  discountEndTime?: string | number
}

const props = defineProps<{
  title: string
  costName: string
  goods: ExchangeGoods[]
  disabled?: boolean
  loading?: boolean
}>()
const order = defineModel<string[]>({ required: true })
const expanded = ref(false)
const dragId = ref<string | null>(null)
const overId = ref<string | null>(null)

const byId = computed(() => new Map(props.goods.map(g => [String(g.goodsId), g])))
const ordered = computed(() => {
  const saved = order.value.filter(id => byId.value.has(id))
  const rest = props.goods.map(g => String(g.goodsId)).filter(id => !saved.includes(id))
  return [...saved, ...rest]
})
const cards = computed(() => ordered.value.map((id, index) => ({ id, rank: index + 1, goods: byId.value.get(id)! })))
const summary = computed(() => (props.loading && !cards.value.length) ? '读取中' : `${cards.value.length} 个商品`)

function originalPrice(goods: ExchangeGoods) {
  return Number(goods.costCount ?? 0)
}
function discounted(goods: ExchangeGoods) {
  const now = Date.now() / 1000
  const price = Number(goods.discountPrice ?? 0)
  const start = Number(goods.discountStartTime ?? 0)
  const end = Number(goods.discountEndTime ?? 0)
  return price > 0 && now >= start && now < end && price < originalPrice(goods)
}
// 折扣额度按「折」显示：7 折表示付原价的 70%。
function discountLabel(goods: ExchangeGoods) {
  const original = originalPrice(goods)
  const current = Number(goods.effectiveCostCount ?? goods.costCount ?? 0)
  if (!discounted(goods) || !original || !current)
    return ''
  const ratio = (current / original) * 10
  if (ratio < 1 || ratio >= 10)
    return ''
  const text = Number.isInteger(Math.round(ratio * 10) / 10) ? String(Math.round(ratio * 10) / 10) : ratio.toFixed(1)
  return `${text}折`
}
function price(goods: ExchangeGoods) {
  const current = Number(goods.effectiveCostCount ?? goods.costCount ?? 0)
  const original = originalPrice(goods)
  if (discounted(goods) && original > current)
    return { current: `${current} ${props.costName}`, original: `${original} ${props.costName}` }
  return current > 0 ? { current: `${current} ${props.costName}`, original: '' } : { current: '—', original: '' }
}
function limit(goods: ExchangeGoods) {
  const total = Number(goods.limitCount ?? 0)
  if (!total)
    return '不限购'
  return `${Number(goods.limitUsed ?? 0)}/${total}`
}
function reorder(from: string, to: string) {
  const ids = [...ordered.value]
  const fromIndex = ids.indexOf(from)
  const toIndex = ids.indexOf(to)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex)
    return
  ids.splice(fromIndex, 1)
  ids.splice(toIndex, 0, from)
  order.value = ids
}
function pin(id: string) {
  if (props.disabled)
    return
  order.value = [id, ...ordered.value.filter(other => other !== id)]
}
function onDragStart(event: DragEvent, id: string) {
  if (props.disabled) {
    event.preventDefault()
    return
  }
  dragId.value = id
  event.dataTransfer?.setData('text/plain', id)
  if (event.dataTransfer)
    event.dataTransfer.effectAllowed = 'move'
}
function onDragOver(event: DragEvent, id: string) {
  if (!dragId.value || dragId.value === id)
    return
  event.preventDefault()
  overId.value = id
}
function onDrop(event: DragEvent, id: string) {
  event.preventDefault()
  if (dragId.value)
    reorder(dragId.value, id)
  dragId.value = null
  overId.value = null
}
function onDragEnd() {
  dragId.value = null
  overId.value = null
}
</script>

<template>
  <section class="exchange-priority border border-gray-100 rounded-lg dark:border-gray-700">
    <button type="button" class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40" @click="expanded = !expanded">
      <span class="min-w-0">
        <span class="block text-sm text-gray-900 font-medium dark:text-gray-100">{{ title }}</span>
        <span class="mt-0.5 block text-xs text-gray-500">{{ summary }} · 按顺序逐个检查，换不了就等数量攒够</span>
      </span>
      <span class="flex items-center gap-2 shrink-0 text-gray-400">
        <span class="text-xs">{{ expanded ? '收起' : '展开' }}</span>
        <span :class="expanded ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'" />
      </span>
    </button>
    <div v-show="expanded" class="space-y-2 border-t border-gray-100 px-3 py-3 dark:border-gray-700">
      <p v-if="loading && !cards.length" class="flex items-center gap-2 px-1 py-3 text-sm text-gray-500">
        <span class="i-svg-spinners-ring-resize animate-spin" aria-hidden="true" />
        正在读取商品，请稍候…
      </p>
      <p v-else-if="!cards.length" class="px-1 py-3 text-sm text-gray-500">
        暂无可兑换商品，打开牧场兑换集市后会自动读取。
      </p>
      <article
        v-for="card in cards"
        :key="card.id"
        :draggable="!disabled"
        class="flex items-center gap-3 border rounded-lg px-3 py-2.5 dark:border-gray-700"
        :class="[
          dragId === card.id ? 'opacity-50' : '',
          overId === card.id ? 'exchange-priority-drop' : '',
          disabled ? 'cursor-not-allowed' : 'cursor-grab',
        ]"
        @dragstart="onDragStart($event, card.id)"
        @dragover="onDragOver($event, card.id)"
        @drop="onDrop($event, card.id)"
        @dragend="onDragEnd"
      >
        <span class="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{{ card.rank }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-gray-900 font-medium dark:text-gray-100">
            {{ card.goods.name || `商品 ${card.id}` }}
          </p>
          <p class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span v-if="price(card.goods).original" class="flex items-center gap-1">
              价格
              <span class="text-gray-400 line-through">{{ price(card.goods).original }}</span>
              <span class="text-emerald-600 font-medium dark:text-emerald-400">{{ price(card.goods).current }}</span>
            </span>
            <span v-else>价格 {{ price(card.goods).current }}</span>
            <span>限购 {{ limit(card.goods) }}</span>
            <span v-if="discountLabel(card.goods)" class="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {{ discountLabel(card.goods) }}
            </span>
          </p>
        </div>
        <button
          type="button"
          :disabled="disabled"
          :title="`将「${card.goods.name || card.id}」置顶`"
          class="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-gray-700"
          @click="pin(card.id)"
        >
          <span class="i-carbon-arrow-up text-base" />
        </button>
      </article>
    </div>
  </section>
</template>

<style scoped>
.exchange-priority-drop {
  border-color: rgb(16 185 129 / 0.8);
  box-shadow: 0 0 0 1px rgb(16 185 129 / 0.35);
}
</style>