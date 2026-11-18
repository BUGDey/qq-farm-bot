<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConfirmModal from '@/components/ConfirmModal.vue'
import RanchFarmPanel from '@/components/ranch/RanchFarmPanel.vue'
import RanchWarehousePanel from '@/components/ranch/RanchWarehousePanel.vue'
import SceneTabs from '@/components/shared/SceneTabs.vue'
import { useRanchSync } from '@/composables/useRanchSync'
import { useAccountStore } from '@/stores/account'
import '@/components/ranch/ranch-glass.css'

const store = useRanchSync()
const account = useAccountStore()
const route = useRoute()
const router = useRouter()
const tabs = [{ value: 'farm', label: '我的牧场', icon: 'i-carbon-sprout' }, { value: 'warehouse', label: '我的仓库', icon: 'i-carbon-box' }, { value: 'tasks', label: '自动任务', icon: 'i-carbon-list-checked' }, { value: 'orders', label: '我的订单', icon: 'i-carbon-task' }]
const confirmation = ref<{ title: string, message: string, payload: any, accountId: string } | null>(null)
watch(() => account.currentAccountId, () => {
  confirmation.value = null
}, { flush: 'sync' })
function requestConfirmation(title: string, message: string, payload: any) {
  confirmation.value = { title, message, payload, accountId: account.currentAccountId }
}
async function confirmAction() {
  const pending = confirmation.value
  confirmation.value = null
  if (pending && pending.accountId === account.currentAccountId)
    await store.mutate('/api/ranch/action', pending.payload)
}
const section = computed({
  get: () => ['warehouse', 'tasks', 'orders'].includes(String(route.query.view)) ? String(route.query.view) : 'farm',
  set: (value) => {
    confirmation.value = null
    void router.replace({ query: { ...route.query, view: value, tab: undefined } })
  },
})
const sectionError = computed(() => store.data?.sectionErrors?.[section.value === 'farm' ? 'overview' : section.value] || '')
// 牧场订单尚未开放（服务端 code=1046001）时给出明确说明，而不是把原始错误码甩给用户。
const ordersNotOpen = computed(() => /1046001|订单栏.{0,6}未开放/.test(String(store.data?.ordersError || '')))
function label(item: any) {
  return item.name || item.title || `#${item.id ?? item.itemId ?? item.facilityId ?? item.ranchInstId ?? '—'}`
}
</script>

<template>
  <section class="ranch-glass-page h-full flex flex-col p-4">
    <SceneTabs v-model="section" :tabs="tabs" class="mb-4" />
    <div class="flex-1 overflow-hidden overflow-y-auto space-y-4">
      <div v-if="!account.currentAccountId" class="ranch-glass-card rounded-lg p-8 text-center text-gray-500">
        请选择账号后查看牧场
      </div>
      <div v-else-if="store.error === '账号未运行' || (store.data && !store.data.sceneReady) || sectionError === '账号未运行'" class="ranch-glass-card flex flex-col items-center justify-center gap-4 rounded-lg p-12 text-center text-gray-500">
        <div class="i-carbon-connection-signal-off text-4xl text-gray-400" />
        <div>
          <div class="text-lg text-gray-700 font-medium dark:text-gray-300">
            账号未登录
          </div><div class="mt-1 text-sm text-gray-400">
            请先运行账号或检查网络连接
          </div>
        </div>
      </div>
      <div v-else-if="store.error" class="border border-red-200 rounded-lg bg-red-50 p-8 text-center text-red-500 dark:border-red-800 dark:bg-red-900/20" role="alert">
        <div class="mb-2 text-lg font-bold">
          获取数据失败
        </div>{{ store.error }}
      </div>
      <div v-else-if="store.loading && !store.data" class="flex justify-center py-12" role="status" aria-label="正在读取牧场">
        <div class="i-svg-spinners-90-ring-with-bg text-4xl text-blue-500" />
      </div>
      <div v-else-if="!store.data" class="ranch-glass-card rounded-lg p-8 text-center text-gray-500">
        暂无牧场数据
      </div>

      <template v-if="account.currentAccountId && store.data">
        <p v-if="sectionError && sectionError !== '账号未运行'" class="rounded-xl bg-red-100 p-4 text-red-700" role="alert">
          {{ sectionError }}
        </p>
        <template v-if="store.data.sceneReady && !sectionError">
          <Transition mode="out-in" enter-active-class="transition duration-200 ease-out" enter-from-class="transform opacity-0 scale-95" enter-to-class="transform opacity-100 scale-100" leave-active-class="transition duration-150 ease-in" leave-from-class="transform opacity-100 scale-100" leave-to-class="transform opacity-0 scale-95">
            <RanchFarmPanel v-if="section === 'farm'" @confirm="requestConfirmation" />
            <RanchWarehousePanel v-else-if="section === 'warehouse'" />
            <div v-else-if="section === 'tasks'" class="space-y-4">
              <div v-if="!store.data.tasks?.length" class="ui-card rounded-xl p-6 text-center text-gray-500">
                暂无牧场任务
              </div>
              <div v-for="task in store.data.tasks || []" :key="task.id" class="ui-card rounded-xl p-4 space-y-3">
                <div class="flex items-start justify-between gap-3">
                  <strong class="min-w-0 break-words">{{ task.desc || `任务 #${task.id}` }}</strong>
                  <span class="shrink-0 rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-700">{{ task.isClaimed ? '已领取' : !task.isUnlocked ? '未解锁' : Number(task.totalProgress) > 0 && Number(task.progress) >= Number(task.totalProgress) ? '已完成' : '进行中' }}</span>
                </div>
                <p class="text-sm opacity-70">
                  {{ ({ 4: '成长任务', 5: '每日任务', 6: '支线任务' } as Record<number, string>)[task.taskType] }} · {{ task.progress }}<template v-if="Number(task.totalProgress) > 0">
                    / {{ task.totalProgress }}
                  </template>
                </p>
                <div v-if="Number(task.totalProgress) > 0" class="h-2 overflow-hidden rounded bg-gray-100 dark:bg-gray-700">
                  <div class="h-full bg-blue-500" :style="{ width: `${Math.max(0, Math.min(100, Number(task.progress) / Number(task.totalProgress) * 100))}%` }" />
                </div>
                <div class="flex flex-wrap gap-3 text-sm">
                  <span v-for="(reward, index) in [...(task.rewards || []), ...(task.activityRewards || [])]" :key="index" class="inline-flex items-center gap-1"><img v-if="reward.image" :src="reward.image" alt="" class="h-6 w-6 object-contain">{{ reward.name }} × {{ reward.count }}</span>
                </div>
              </div>
            </div>
            <div v-else-if="section === 'orders'" class="space-y-3">
              <div v-if="store.data.orderPanel" class="ui-card flex flex-wrap gap-6 rounded-lg p-4 text-sm">
                <span>可提交 {{ store.data.orderPanel.submitQuota }} 次</span><span>可刷新 {{ store.data.orderPanel.refreshQuota }} 次</span><span>订单板 Lv.{{ store.data.orderPanel.boardLevel }}</span>
              </div>
              <div v-if="ordersNotOpen" class="ui-card flex flex-col items-center gap-3 rounded-xl p-10 text-center">
                <span class="i-carbon-task text-3xl text-emerald-500" />
                <p class="text-base font-semibold text-gray-700 dark:text-gray-200">牧场订单栏还未开放</p>
                <p class="max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
                  当前游戏版本尚未开放牧场订单玩法，服务端返回「订单栏还未开放，敬请期待」。开放后本页会自动显示可提交/可刷新的订单，无需额外设置；请留意游戏内的功能开放公告。
                </p>
              </div>
              <p v-else-if="store.data.ordersError" class="rounded-lg bg-red-100 p-4 text-red-700" role="alert">
                订单读取失败：{{ store.data.ordersError }}
              </p><div v-else-if="!store.data.orders?.length" class="ui-card rounded-xl p-6">
                暂无订单数据
              </div><div v-for="order in store.data.orders || []" :key="order.id" class="ui-card rounded-xl p-4">
                <strong>{{ label(order) }}</strong><p class="mt-2 text-sm opacity-70">
                  {{ order.statusLabel }}
                </p>
                <p class="mt-3 text-sm font-semibold">
                  需求
                </p><p v-for="item in order.requirements || []" :key="item.id" class="mt-1 text-sm opacity-70">
                  {{ label(item) }} × {{ item.count }} · 可用库存 {{ store.data.items.filter((i: any) => String(i.id) === String(item.id) && !i.locked && !i.detail?.ranchProduct).reduce((n: bigint, i: any) => n + BigInt(i.count || 0), 0n).toString() }}
                </p>
                <p class="mt-3 text-sm font-semibold">
                  奖励
                </p><p v-for="item in order.rewards || []" :key="item.id" class="mt-1 text-sm opacity-70">
                  {{ label(item) }} × {{ item.count }}
                </p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button v-if="store.data.capabilities?.submitOrder && order.canSubmit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40" :disabled="store.busy || store.loading" @click="requestConfirmation('提交订单', `确认提交${label(order)}？将消耗上方列出的需求物品。`, { action: 'submitOrder', slotIndex: order.slotIndex, instanceId: order.id })">
                    提交订单
                  </button>
                  <button v-if="store.data.capabilities?.refreshOrder && order.canRefresh" class="border rounded-lg px-3 py-2 text-sm disabled:opacity-40" :disabled="store.busy || store.loading" @click="requestConfirmation('刷新订单', `确认刷新${label(order)}？当前订单将被替换，并占用可用刷新次数。`, { action: 'refreshOrder', slotIndex: order.slotIndex, instanceId: order.id })">
                    刷新订单
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </template>
      </template>
    </div>
    <ConfirmModal :show="!!confirmation" :title="confirmation?.title" :message="confirmation?.message" :loading="store.busy" @confirm="confirmAction" @cancel="confirmation = null" @close="confirmation = null" />
  </section>
</template>
