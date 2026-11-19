<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import RanchPageShell from '@/components/ranch/RanchPageShell.vue'
import RanchShopGoodsCard from '@/components/ranch/RanchShopGoodsCard.vue'
import PurchaseQuantityModal from '@/components/shop/PurchaseQuantityModal.vue'
import ShopEmptyState from '@/components/shop/ShopEmptyState.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useRanchResource } from '@/composables/useRanchResource'
import { useAccountStore } from '@/stores/account'
import { ranchDate } from '@/utils/ranch-display'

const page = ref('shop')
const resource = useRanchResource(page)
const tab = ref('5')
const selected = ref<any>(null)
const exchange = ref<any>(null)
async function redeem() {
  const payload = exchange.value
  exchange.value = null
  if (payload)
    await resource.mutate(payload)
}
async function purchase(count: number) {
  const goods = selected.value
  if (!goods)
    return
  selected.value = null
  await resource.mutate({ action: 'buy', goodsId: goods.id, count, price: String(goods.price) })
}
const account = useAccountStore()
watch(() => account.currentAccountId, () => {
  selected.value = null
  exchange.value = null
})
const shop = computed(() => (resource.data.value?.shops || []).find((s: any) => String(s.shopId) === tab.value))

function purchaseBlock(goods: { price: unknown, limitCount?: unknown, boughtNum?: unknown }) {
  const limit = Number(goods.limitCount)
  if (limit > 0 && Number(goods.boughtNum ?? 0) >= limit)
    return '已达限购'
  const balance = resource.data.value?.balance
  if (balance == null || balance === '' || !Number.isFinite(Number(balance)))
    return '余额未确认'
  if (Number(goods.price) > Number(balance))
    return '金券不足'
  return ''
}
</script>

<template>
  <RanchPageShell title="商城" :loading="resource.loading.value" :busy="resource.busy.value" :error="resource.error.value" :has-data="!!resource.data.value" @refresh="resource.refresh">
    <div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
      <div class="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div class="min-w-0 flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2">
            <span class="i-carbon-store text-2xl text-emerald-500" />
            <h1 class="text-xl font-bold">
              商城
            </h1>
          </div>
          <span v-for="item in resource.data.value?.resources || []" :key="item.id" class="h-8 flex items-center gap-2 rounded-lg bg-gray-50 px-3 text-xs text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
            <img :src="item.image" :alt="item.name" class="h-5 w-5 shrink-0 object-contain">
            <span>{{ item.name }} {{ item.count ?? '—' }}</span>
          </span>
          <span class="h-8 max-w-full flex items-center rounded-lg bg-gray-50 px-3 text-xs text-gray-700 dark:bg-gray-900/40 dark:text-gray-300"><span class="truncate">{{ account.currentAccount?.name || '未选择' }}</span></span>
        </div>
        <div class="min-w-0 flex flex-wrap items-center gap-2">
          <nav class="max-w-full overflow-x-auto pb-1" aria-label="商城分区">
            <div class="h-9 min-w-max inline-flex border border-gray-200 rounded-lg bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800">
              <button v-for="item in [{ value: '5', label: '幼崽商店' }, { value: '6', label: '饲料商店' }, { value: '7', label: '仓鼠驿站' }]" :key="item.value" class="min-w-20 shrink-0 rounded-md px-3 text-sm font-medium transition" :class="tab === item.value ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'" :style="tab === item.value ? { backgroundColor: 'var(--theme-primary)' } : {}" :aria-current="tab === item.value ? 'page' : undefined" @click="tab = item.value">
                {{ item.label }}
              </button>
            </div>
          </nav>
          <BaseButton class="w-24" variant="primary" :loading="resource.loading.value" :disabled="resource.busy.value" @click="resource.refresh">
            刷新
          </BaseButton>
        </div>
      </div>
      <template v-if="tab !== '7'">
        <div v-if="shop?.error" class="ui-card rounded-lg p-5 text-red-600">
          {{ shop.error }}
        </div>
        <ShopEmptyState v-else-if="!shop?.goodsList?.length" :message="resource.loading.value ? '正在加载当前分区商品…' : '暂无商品'" />
        <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-3">
          <RanchShopGoodsCard v-for="goods in shop?.goodsList || []" :key="goods.id" :item="goods" :badge="goods.unlocked ? '已解锁' : '未解锁'">
            <p class="text-center text-xs text-amber-600 font-semibold dark:text-amber-400">
              {{ goods.price }} {{ goods.currencyName || '未知货币' }}
            </p>
            <p class="mt-2 text-[11px] text-gray-500 leading-5 dark:text-gray-400">
              数量 ×{{ goods.itemCount }} · 已购 {{ goods.boughtNum ?? '—' }} / {{ goods.limitCount ?? '不限' }}
            </p><BaseButton variant="primary" class="mt-auto w-full" :disabled="!goods.unlocked || goods.owned || goods.priceId !== 1007 || resource.busy.value || resource.loading.value || !!purchaseBlock(goods)" @click="selected = goods">
              {{ goods.owned ? '已拥有' : !goods.unlocked ? '未解锁' : goods.priceId !== 1007 ? '不支持购买' : purchaseBlock(goods) || '立即购买' }}
            </BaseButton>
          </RanchShopGoodsCard>
        </div>
      </template><template v-else>
        <div class="space-y-4">
          <p>{{ resource.data.value?.exchangeMarket?.opened && resource.data.value?.exchangeMarket?.present ? '营业中' : '当前未营业' }} · 轮次 {{ resource.data.value?.exchangeMarket?.roundIndex ?? '—' }}</p><div class="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-3">
            <RanchShopGoodsCard v-for="goods in resource.data.value?.exchangeMarket?.goods || []" :key="goods.goodsId" :item="{ ...goods, id: goods.goodsId }" badge="兑换">
              <p class="mt-1 break-words text-center text-xs text-amber-600 font-semibold dark:text-amber-400">
                消耗 {{ goods.costItemName || `物品 ${goods.costItemId}` }} × {{ goods.effectiveCostCount ?? goods.costCount }}
              </p><p v-if="Number(goods.discountEndTime) > 0" class="mt-1 text-xs text-gray-500">
                折扣结束 {{ ranchDate(goods.discountEndTime, false) }}
              </p><p class="mt-1 text-xs text-gray-500">
                已兑换 {{ goods.limitUsed }} / {{ goods.limitCount }}
              </p><BaseButton variant="primary" class="mt-auto w-full" :disabled="resource.busy.value || resource.loading.value || !resource.data.value?.exchangeMarket?.opened || !resource.data.value?.exchangeMarket?.present || !['7002', '1008'].includes(String(goods.costItemId)) || (Number(goods.limitCount) > 0 && Number(goods.limitUsed) >= Number(goods.limitCount))" @click="exchange = { action: 'exchange', goodsId: goods.goodsId, count: 1, periodDay: resource.data.value.exchangeMarket.periodDay, roundIndex: resource.data.value.exchangeMarket.roundIndex, costCount: String(goods.effectiveCostCount ?? goods.costCount), costItemId: String(goods.costItemId), name: goods.name, costName: goods.costItemName }">
                兑换
              </BaseButton>
            </RanchShopGoodsCard>
          </div>
        </div>
      </template>
    </div>
    <p v-if="resource.data.value?.errors?.balance" class="text-sm text-red-600">
      余额读取失败：{{ resource.data.value.errors.balance }}
    </p><ConfirmModal :show="!!exchange" title="兑换商品" :message="exchange ? `确认兑换${exchange.name || '该商品'}？消耗${exchange.costName || exchange.costItemId} × ${exchange.costCount}。` : ''" :loading="resource.busy.value" @confirm="redeem" @close="exchange = null" @cancel="exchange = null" /><PurchaseQuantityModal :show="!!selected" :item-name="selected?.name || ''" :unit-price="Number(selected?.price || 0)" currency-label="金券" :balance="Number(resource.data.value?.balance || 0)" :max-quantity="Math.min(Number(selected?.maxQuantity || 99), Number(selected?.limitCount) > 0 ? Math.max(0, Number(selected.limitCount) - Number(selected.boughtNum || 0)) : 999)" :loading="resource.busy.value" @confirm="purchase" @close="selected = null" @cancel="selected = null" />
  </RanchPageShell>
</template>
