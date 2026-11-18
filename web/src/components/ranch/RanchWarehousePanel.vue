<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { useAccountStore } from '@/stores/account'
import { useRanchStore } from '@/stores/ranch'
import { canConfirmWarehouseAction, warehouseItemKey as key, validWarehouseCount } from '@/utils/ranch-warehouse'

const store = useRanchStore()
const account = useAccountStore()
const route = useRoute()
const router = useRouter()
const imageErrors = ref<Record<string, boolean>>({})
const pending = ref<any>(null)
const itemCount = ref(1)
const selectedCategory = computed(() => String(route.query.tab || ''))
const items = computed<any[]>(() => store.data?.items || [])
const filteredItems = computed(() => items.value.filter(item => !selectedCategory.value || (item.tabIds || []).some((id: number) => String(id) === selectedCategory.value)))
const categories = computed(() => [{ id: '', name: '全部' }, ...(store.data?.tabs || [])].map(tab => ({ ...tab, count: items.value.filter(item => !String(tab.id) || (item.tabIds || []).some((id: number) => String(id) === String(tab.id))).length })))
function selectCategory(id: unknown) {
  void router.replace({ query: { ...route.query, view: 'warehouse', tab: String(id) || undefined } })
}
function reset() {
  pending.value = null
  itemCount.value = 1
  imageErrors.value = {}
}
watch(() => account.currentAccountId, reset, { flush: 'sync' })
watch(() => store.data, () => {
  pending.value = null
}, { flush: 'sync' })
function request(item: any) {
  if (store.busy || store.loading || item.locked || (!item.canSell && !item.canUseCan))
    return
  pending.value = { ...item, accountId: account.currentAccountId }
  itemCount.value = 1
}
const valid = computed(() => pending.value && validWarehouseCount(itemCount.value, pending.value.count))
async function confirm() {
  const item = pending.value
  if (!valid.value || !item || item.accountId !== account.currentAccountId || store.busy || store.loading)
    return
  const live = items.value.find(i => key(i) === key(item))
  if (!canConfirmWarehouseAction(item, live, itemCount.value, account.currentAccountId)) {
    pending.value = null
    return
  }
  const count = itemCount.value
  pending.value = null
  await store.mutate('/api/ranch/action', { action: item.canUseCan ? 'useCan' : 'sell', itemId: item.id, uid: item.uid || '0', count })
}
</script>

<template>
  <div class="space-y-4">
    <div class="ranch-glass-card mb-4 flex flex-wrap items-center justify-between gap-2 p-4">
      <h2 class="flex items-center gap-2 text-2xl font-bold">
        <div class="i-carbon-inventory-management" />仓库
      </h2>
      <div v-if="items.length" class="text-sm text-gray-500">
        共 {{ items.length }} 种物品
      </div>
    </div>
    <p v-if="store.data?.sectionErrors?.tabs" class="text-sm text-red-600" role="alert">
      分类读取失败：{{ store.data.sectionErrors.tabs }}
    </p>
    <div class="ranch-glass-card mb-4 flex flex-wrap items-center gap-2 p-3">
      <button v-for="cat in categories" :key="cat.id" class="rounded-lg px-3 py-1.5 text-sm font-medium transition" :class="selectedCategory === String(cat.id) ? 'bg-blue-500 text-white dark:bg-blue-600' : 'bg-white/45 text-gray-700 hover:bg-white/70 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20'" @click="selectCategory(cat.id)">
        {{ cat.name || cat.title || `#${cat.id}` }}<span class="ml-1 text-xs opacity-70">({{ cat.count }})</span>
      </button>
    </div>
    <div v-if="!filteredItems.length" class="ranch-glass-card rounded-lg p-8 text-center text-gray-500">
      {{ items.length ? '当前分类暂无物品' : '无可展示物品' }}
    </div>
    <div v-else class="grid grid-cols-2 gap-4 lg:grid-cols-5 md:grid-cols-4 sm:grid-cols-3 xl:grid-cols-6">
      <div v-for="item in filteredItems" :key="key(item)" class="ranch-warehouse-item group relative flex flex-col items-center border rounded-lg p-3 transition hover:shadow-md">
        <div class="absolute left-2 top-2 text-xs text-gray-400 font-mono">
          #{{ item.id }}
        </div>
        <div class="absolute right-1 top-1 flex gap-1">
          <button v-if="!item.locked && (item.canSell || item.canUseCan)" class="rounded px-1.5 py-0.5 text-[10px] text-white opacity-70 transition disabled:opacity-40 hover:opacity-100" :class="item.canUseCan ? 'bg-green-500 dark:bg-green-600' : 'bg-red-500 dark:bg-red-600'" :title="item.canUseCan ? '装填罐头' : '出售产物'" :disabled="store.busy || store.loading" @click="request(item)">
            {{ item.canUseCan ? '用' : '售' }}
          </button>
        </div>
        <div class="mb-2 mt-6 h-16 w-16 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-700/50">
          <img v-if="item.image && !imageErrors[key(item)]" :src="item.image" :alt="item.name" class="max-h-full max-w-full object-contain" loading="lazy" @error="imageErrors[key(item)] = true">
          <div v-else class="text-2xl text-gray-400 font-bold">
            {{ (item.name || '物').slice(0, 1) }}
          </div>
        </div>
        <div class="mb-1 w-full truncate px-2 text-center text-sm font-bold" :title="item.name">
          {{ item.name || `物品${item.id}` }}
        </div>
        <div class="mb-2 max-w-full flex flex-col items-center gap-0.5 text-xs text-gray-400">
          <span v-if="item.uid && String(item.uid) !== '0'" class="max-w-full break-all">UID: {{ item.uid }}</span>
          <span v-if="item.locked">已锁定</span>
          <span v-if="item.detail?.ranchProduct">特殊产物，暂不开放出售</span>
        </div>
        <div class="mt-auto text-gray-600 font-medium dark:text-gray-300">
          x{{ item.count ?? item.num ?? '—' }}
        </div>
      </div>
    </div>
    <ConfirmModal :show="!!pending" :title="pending?.canUseCan ? '装填罐头' : '出售产物'" :message="pending ? `确认${pending.canUseCan ? '使用' : '出售'} ${pending.name} × ${itemCount}？${pending.canUseCan ? '装入对应罐头容器，不购买额外道具。' : '仅出售当前选中的普通产物，不处理锁定或特殊实例。'}` : ''" :loading="store.busy" :confirm-disabled="!valid || store.loading" @confirm="confirm" @cancel="pending = null" @close="pending = null">
      <label class="flex items-center gap-3 text-sm">数量<input v-model.number="itemCount" type="number" min="1" :max="Math.min(Number(pending?.count || 0), 99999)" class="w-28 border rounded-lg bg-transparent p-2"></label>
      <p v-if="!valid" class="mt-2 text-sm text-red-500">
        请输入库存范围内的整数数量
      </p>
    </ConfirmModal>
  </div>
</template>
