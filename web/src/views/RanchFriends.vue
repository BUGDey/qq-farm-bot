<script setup lang="ts">
import type { FriendTabItem, FriendTabKey } from '@/components/friends/FriendsTabs.vue'
import type { RanchFriendAction } from '@/utils/ranch-friend-actions'
import { useIntervalFn } from '@vueuse/core'
import { computed, onUnmounted, ref, watch } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import FriendCheatPanel from '@/components/friends/FriendCheatPanel.vue'
import FriendsPageHeader from '@/components/friends/FriendsPageHeader.vue'
import FriendsTabs from '@/components/friends/FriendsTabs.vue'
import RanchAnimalBubble from '@/components/ranch/RanchAnimalBubble.vue'
import RanchScene from '@/components/ranch/RanchScene.vue'
import { ranchAnimalProgress } from '@/utils/ranch-animal-progress'
import RanchPageShell from '@/components/ranch/RanchPageShell.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { useRanchResource } from '@/composables/useRanchResource'
import { useAccountStore } from '@/stores/account'
import { runRanchFriendActions } from '@/utils/ranch-friend-actions'
import '@/components/ranch/ranch-glass.css'

const resource = useRanchResource(ref('friends'))
const query = ref('')
const tab = ref<FriendTabKey>('friends')
const sort = ref('level')
const filter = ref('all')
const currentPage = ref(1)
const selected = ref('')
const account = useAccountStore()
const confirmation = ref<any>(null)
const batchBusy = ref(false)
const batchMessage = ref('')
const locked = computed(() => batchBusy.value || resource.busy.value || (resource.loading.value && !resource.data.value))
let batchEpoch = 0
onUnmounted(() => {
  batchEpoch++
})
const quickActions: { action: RanchFriendAction, label: string, style: string }[] = [
  { action: 'steal', label: '一键偷取', style: 'border border-white/70 bg-blue-100/70 text-blue-700 hover:bg-blue-200/90' },
  { action: 'help', label: '一键清理', style: 'border border-white/70 bg-green-100/70 text-green-700 hover:bg-green-200/90' },
  { action: 'stroke', label: '一键照料', style: 'border border-white/70 bg-cyan-100/70 text-cyan-700 hover:bg-cyan-200/90' },
  { action: 'putHazard', label: '一键放蚊子', style: 'border border-white/70 bg-red-100/70 text-red-700 hover:bg-red-200/90' },
  { action: 'addFeed', label: '帮补牧草', style: 'border border-white/70 bg-lime-100/70 text-lime-700 hover:bg-lime-200/90' },
]
function requestBatch(gid: string, action: RanchFriendAction) {
  if (locked.value)
    return
  confirmation.value = { accountId: account.currentAccountId, batch: true, payload: { action, hostGid: String(gid) } }
}
const detail = computed(() => resource.result.value?.friend?.hostGid === selected.value ? resource.result.value.friend : null)
const localNow = ref(Date.now())
useIntervalFn(() => {
  if (!document.hidden)
    localNow.value = Date.now()
}, 1000)
const sceneRanches = computed(() => (detail.value?.ranches || []).map((ranch: any) => ({
  ...ranch,
  animals: (ranch.animals || []).map((animal: any) => ({ ...animal, progress: ranchAnimalProgress(animal, localNow.value) })),
})))
const selectedRanchId = ref('')
const selectedAnimalId = ref('')
const animalAnchor = ref<HTMLElement | null>(null)
const selectedRanch = computed(() => sceneRanches.value.find((ranch: any) => String(ranch.ranchInstId) === selectedRanchId.value))
const selectedAnimal = computed(() => selectedRanch.value?.animals.find((animal: any) => String(animal.animalInstId) === selectedAnimalId.value))
function closeDetails() {
  selectedRanchId.value = ''
  selectedAnimalId.value = ''
  animalAnchor.value = null
}
function selectAnimal(ranchId: string, animalId: string, anchor: HTMLElement) {
  selectedRanchId.value = ranchId
  selectedAnimalId.value = animalId
  animalAnchor.value = anchor
}
watch([selected, tab, currentPage, query, filter, sort], closeDetails)
const actionLabels: Record<string, string> = { steal: '偷取产物', help: '帮助清理', stroke: '照料动物', putHazard: '放蚊子', addFeed: '帮补牧草' }
const confirmationMessage = computed(() => {
  const pending = confirmation.value
  if (!pending)
    return ''
  const descriptions: Record<RanchFriendAction, { batch: string, single: string }> = {
    steal: { batch: '依次偷取当前可偷取货架的产物', single: '偷取所选货架的产物' },
    help: { batch: '依次帮助清理有灾害的栏舍', single: '帮助清理所选栏舍的灾害' },
    stroke: { batch: '依次照料当前可照料的动物', single: '照料所选动物' },
    putHazard: { batch: '依次向栏舍放蚊子', single: '向所选栏舍放蚊子 × 1' },
    addFeed: { batch: '依次给好友牧草机补草（消耗自己的牧草）', single: '给好友牧草机补草（消耗自己的牧草）' },
  }
  const description = descriptions[pending.payload.action as RanchFriendAction]
  if (!description)
    return '请确认当前操作。'
  return `确认对好友 ${pending.payload.hostGid} ${pending.batch ? description.batch : description.single}？`
})
async function executeBatch(pending: any) {
  const epoch = ++batchEpoch
  const active = () => epoch === batchEpoch && pending.accountId === account.currentAccountId
  batchBusy.value = true
  batchMessage.value = '正在读取好友牧场…'
  selected.value = pending.payload.hostGid
  try {
    if (!await resource.mutate({ action: 'visitFriend', hostGid: selected.value }) || !active()) {
      if (active())
        batchMessage.value = '好友牧场读取失败，未执行一键操作'
      return
    }
    const count = await runRanchFriendActions(pending.payload.action, {
      active: () => active() && !resource.result.value?.refreshError && !resource.result.value?.warning,
      detail: () => detail.value,
      mutate: payload => resource.mutate(payload),
    })
    if (active())
      batchMessage.value = `${actionLabels[pending.payload.action]}：已完成 ${count} 项${resource.error.value || resource.result.value?.refreshError || resource.result.value?.warning ? '，执行已停止，请查看错误或提示' : count ? '' : '，暂无可操作目标或次数不足'}`
  }
  finally {
    if (active())
      batchBusy.value = false
  }
}
watch(() => account.currentAccountId, () => {
  batchEpoch++
  batchBusy.value = false
  batchMessage.value = ''
  selected.value = ''
  closeDetails()
  confirmation.value = null
}, { flush: 'sync' })
async function visit(gid: string) {
  if (locked.value)
    return
  if (selected.value === String(gid)) {
    selected.value = ''
    closeDetails()
    return
  }
  selected.value = String(gid)
  await resource.mutate({ action: 'visitFriend', hostGid: selected.value })
}
function request(action: string, ranchId: string, extra: Record<string, unknown> = {}) {
  confirmation.value = { accountId: account.currentAccountId, payload: { action, hostGid: selected.value, ranchId, ...extra } }
}
async function confirm() {
  const pending = confirmation.value
  confirmation.value = null
  if (pending?.accountId !== account.currentAccountId || locked.value)
    return
  if (pending.batch)
    await executeBatch(pending)
  else await resource.mutate(pending.payload)
}
const rewards = computed(() => {
  const reply = resource.result.value?.reply
  return [...(reply?.rewards || []), ...(reply?.opResult?.rewards || []), ...(reply?.opResults || []).flatMap((o: any) => o.rewards || [])]
})
const visitors = computed(() => (resource.data.value?.visitors || []).filter((r: any) => !query.value || `${r.oprNickname} ${r.oprGid}`.toLowerCase().includes(query.value.toLowerCase())))
function time(value: unknown) {
  const seconds = Number(value)
  return seconds > 0 ? new Date(seconds < 1e12 ? seconds * 1000 : seconds).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'
}
const pageSize = 20
const tabs: FriendTabItem[] = [{ key: 'friends', label: '好友列表', icon: 'i-carbon-user-multiple' }, { key: 'cheat', label: '外挂检测', icon: 'i-carbon-warning-alt' }, { key: 'blacklist', label: '好友黑名单', icon: 'i-carbon-list-blocked' }, { key: 'visitors', label: '最近访客', icon: 'i-carbon-user-activity' }]
const friends = computed(() => (resource.data.value?.friends || []).filter((f: any) => (!query.value || `${f.name} ${f.remark} ${f.gid}`.toLowerCase().includes(query.value.toLowerCase())) && (filter.value === 'all' || f.bigFarmStatus?.[filter.value] === true)).slice().sort((a: any, b: any) => sort.value === 'name' ? String(a.name).localeCompare(String(b.name), 'zh-CN') : Number(b.bigFarmLevel || 0) - Number(a.bigFarmLevel || 0)))
const pages = computed(() => Math.max(1, Math.ceil(friends.value.length / pageSize)))
const visible = computed(() => friends.value.slice((Math.min(currentPage.value, pages.value) - 1) * pageSize, Math.min(currentPage.value, pages.value) * pageSize))
</script>

<template>
  <RanchPageShell class="ranch-glass-page" title="好友" :loading="resource.loading.value" :busy="resource.busy.value" :error="resource.error.value" :has-data="!!resource.data.value" @refresh="resource.refresh">
    <FriendsPageHeader v-model:search-keyword="query" :active-tab="tab" :friends-count="resource.data.value?.friends?.length || 0" :filtered-friends-count="friends.length" :blacklist-count="resource.data.value?.blockedPlayers?.length || 0" :interact-records-count="resource.data.value?.visitors?.length || 0" :filtered-interact-records-count="visitors.length" />
    <FriendsTabs class="friends-tabs" v-model:active-tab="tab" :tabs="tabs" :blacklist-count="resource.data.value?.blockedPlayers?.length || 0" />
    <div v-if="tab === 'friends'" class="space-y-4">
      <div class="flex flex-wrap gap-3">
        <BaseSelect v-model="filter" :options="[{ label: '全部好友', value: 'all' }, { label: '可偷取', value: 'canSteal' }, { label: '可帮助', value: 'canHelp' }, { label: '可助产', value: 'canMidwife' }]" class="w-36" /><BaseSelect v-model="sort" :options="[{ label: '牧场等级倒序', value: 'level' }, { label: '名称排序', value: 'name' }]" class="w-40" />
      </div>
      <p v-if="batchMessage" class="text-sm text-blue-600" role="status">
        {{ batchMessage }}
      </p>
      <div class="grid grid-cols-1 gap-3">
        <article v-for="friend in visible" :key="friend.gid" class="ui-card overflow-hidden rounded-lg">
          <!-- 账号信息与操作按钮同行：账号（头像/昵称/等级）在左，快捷操作按钮紧跟其后放在同一行右侧 -->
          <div class="flex flex-wrap items-center gap-3 p-4">
            <button class="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-40" :disabled="locked" :aria-expanded="selected === String(friend.gid)" @click="visit(String(friend.gid))">
              <img v-if="friend.avatarUrl" :src="friend.avatarUrl" class="h-10 w-10 shrink-0 rounded-full" alt=""><span v-else class="i-carbon-user text-2xl text-gray-400" />
              <div class="min-w-0">
                <h2 class="font-semibold truncate">
                  {{ friend.remark || friend.name || '好友' }} ({{ friend.gid }})
                </h2>
                <p class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                  <span>牧场 Lv.{{ friend.bigFarmLevel ?? '—' }} · 主城 Lv.{{ friend.mainCityLevel ?? '—' }}</span>
                  <span v-if="friend.bigFarmStatus?.canSteal" class="rounded bg-amber-50 px-2 py-1 text-amber-700">可偷取</span><span v-if="friend.bigFarmStatus?.canHelp" class="rounded bg-blue-50 px-2 py-1 text-blue-700">可帮助</span><span v-if="friend.bigFarmStatus?.canMidwife" class="rounded bg-emerald-50 px-2 py-1 text-emerald-700">可助产</span>
                </p>
              </div>
            </button>
            <div class="flex flex-wrap gap-2">
              <button v-for="item in quickActions" :key="item.action" class="ranch-friend-action rounded-lg px-3 py-2 text-sm transition disabled:opacity-40" :class="item.style" :disabled="locked" @click="requestBatch(String(friend.gid), item.action)">
                {{ item.label }}
              </button>
            </div>
          </div><div v-if="selected === String(friend.gid)" class="border-t p-4 text-sm dark:border-gray-700">
            <div class="grid grid-cols-3 gap-3">
              <span>可偷取批次 {{ friend.bigFarmStatus?.stealLotCount ?? '—' }}</span><span>可帮助 {{ friend.bigFarmStatus?.helpCount ?? '—' }}</span><span>可助产 {{ friend.bigFarmStatus?.midwifeCount ?? '—' }}</span>
            </div>
            <p v-if="resource.busy.value" class="mt-3">
              正在读取或操作…
            </p>
            <template v-if="detail">
              <p v-if="resource.result.value?.action !== 'visitFriend'" class="mt-3 text-emerald-600" role="status">
                {{ actionLabels[resource.result.value?.action] }}请求完成<span v-for="(reward, index) in rewards" :key="index"> · {{ reward.name }} × {{ reward.count }}</span>
              </p>
              <p v-if="resource.result.value?.warning || resource.result.value?.refreshError" class="mt-3 text-amber-600" role="status">
                {{ resource.result.value.warning || `操作已完成，详情刷新失败：${resource.result.value.refreshError}` }}
              </p>
              <p class="mt-3 text-xs text-gray-500">
                照料剩余 {{ detail.ops.find((o: any) => o.opId === '11009')?.remainingTimes ?? '—' }} · 放蚊子剩余 {{ detail.ops.find((o: any) => o.opId === '11003')?.remainingTimes ?? '—' }}
              </p>
              <div class="mt-3">
                <RanchScene :ranches="sceneRanches" :facilities="detail.facilities || []" title="好友牧场" @select="selectedRanchId = $event; selectedAnimalId = ''" @animal="selectAnimal" />
              </div>
              <article v-for="ranch in sceneRanches.filter((r: any) => String(r.ranchInstId) === selectedRanchId)" :key="ranch.ranchInstId" class="mt-3 border rounded-lg p-3 space-y-3">
                <button type="button" class="float-right text-xs text-gray-500" @click="closeDetails">关闭详情</button>
                <strong>{{ ranch.name }}</strong><span class="ml-2 text-xs text-gray-500">动物 {{ ranch.animals.length }}/{{ ranch.capacity }} · 灾害 {{ ranch.hazards.length }}</span>
                <div class="flex flex-wrap gap-2">
                  <button v-if="ranch.hazards.length" class="border rounded px-3 py-2 disabled:opacity-40" :disabled="locked" @click="request('help', ranch.ranchInstId)">
                    帮助清理
                  </button>
                  <button class="border rounded px-3 py-2 disabled:opacity-40" :disabled="locked || !(Number(detail.ops.find((o: any) => o.opId === '11003')?.remainingTimes) > 0)" @click="request('putHazard', ranch.ranchInstId)">
                    放蚊子 × 1
                  </button>
                  <button v-for="shelf in ranch.shelves.filter((s: any) => s.canSteal)" :key="shelf.slotIndex" class="border rounded px-3 py-2 disabled:opacity-40" :disabled="locked" @click="request('steal', ranch.ranchInstId, { slotIndex: shelf.slotIndex })">
                    偷取货架 {{ shelf.slotIndex + 1 }}
                  </button>
                </div>
                <div v-for="animal in ranch.animals" :key="animal.animalInstId" class="flex items-center justify-between gap-2 border-t pt-2">
                  <span>{{ animal.name }} · {{ animal.stageLabel }}</span><button v-if="animal.canStroke" class="border rounded px-3 py-2 disabled:opacity-40" :disabled="locked" @click="request('stroke', ranch.ranchInstId, { animalInstId: animal.animalInstId })">
                    照料
                  </button>
                </div>
              </article>
              <p v-if="!detail.ranches.length && !resource.result.value?.refreshError" class="mt-3 text-gray-500">
                该好友暂无栏舍
              </p>
            </template>
          </div>
        </article>
      </div>
      <div v-if="!friends.length" class="ui-card rounded-lg p-8 text-center text-gray-500">
        暂无符合条件的牧场好友
      </div>
      <div class="flex items-center justify-center gap-4 text-sm">
        <button :disabled="currentPage <= 1" @click="currentPage = Math.max(1, Math.min(currentPage, pages) - 1)">
          上一页
        </button><span>{{ Math.min(currentPage, pages) }} / {{ pages }}</span><button :disabled="currentPage >= pages" @click="currentPage++">
          下一页
        </button>
      </div>
    </div>
    <div v-else-if="tab === 'cheat'" class="space-y-4">
      <FriendCheatPanel />
    </div>
    <div v-else-if="tab === 'blacklist'" class="space-y-3">
      <article v-for="friend in resource.data.value?.blockedPlayers || []" :key="friend.gid" class="ui-card rounded-lg p-4">
        {{ friend.name }} · {{ friend.gid }}
      </article><p v-if="!resource.data.value?.blockedPlayers?.length" class="ui-card rounded-lg p-8 text-center text-gray-500">
        暂无服务端黑名单记录
      </p><p class="text-xs text-gray-500">
        当前为账号服务端屏蔽记录；尚未开放变更，不与农场自动化排除名单混用。
      </p>
    </div>
    <div v-else class="space-y-3">
      <p v-if="resource.data.value?.visitorsError" class="text-red-600" role="alert">
        访客记录读取失败：{{ resource.data.value.visitorsError }}
      </p>
      <p v-else-if="!visitors.length" class="ui-card rounded-lg p-8 text-center text-gray-500">
        暂无牧场访客记录
      </p>
      <article v-for="(record, index) in visitors" :key="index" class="ui-card rounded-lg p-4">
        <strong>{{ record.oprNickname || '访客' }}</strong><span class="ml-3 text-xs text-gray-500">{{ time(record.time) }}（北京时间）</span>
        <p class="mt-2 text-sm">
          {{ record.description || `互动类型 ${record.interactType}` }}<span v-if="record.stealItemId && record.stealItemId !== '0'"> · 物品 {{ record.stealItemId }} × {{ record.stealItemNum }}</span>
        </p>
      </article>
    </div>
    <RanchAnimalBubble v-if="selectedAnimal && animalAnchor" :animal="selectedAnimal" :anchor="animalAnchor" :ranch-name="selectedRanch?.name || '窝棚'" @close="closeDetails" />
    <ConfirmModal :show="!!confirmation" :title="actionLabels[confirmation?.payload?.action] || '确认操作'" :message="confirmationMessage" :loading="resource.busy.value" @confirm="confirm" @cancel="confirmation = null" @close="confirmation = null" />
  </RanchPageShell>
</template>

<style scoped>
/* 顶层 tab：未选中态磨砂玻璃半透明；选中态保留 FriendsTabs 的内联主题色 */
.friends-tabs :deep(> button:not(.border-transparent)) {
  border-color: rgba(255, 255, 255, 0.75);
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.45));
  box-shadow: 0 4px 14px rgba(31, 38, 80, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
}
.friends-tabs :deep(> button:not(.border-transparent):hover) {
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.66));
}
/* 选中态：保留主题色，仅补充玻璃质感 */
.friends-tabs :deep(> button.border-transparent) {
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--theme-primary) 35%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
}
/* 好友卡片操作按钮：磨砂玻璃半透明、可换行 */
.ranch-friend-action {
  border-color: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}
</style>
