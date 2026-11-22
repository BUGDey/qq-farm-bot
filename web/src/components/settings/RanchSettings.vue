<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRanchActionLock } from '@/composables/useRanchActionLock'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import ExchangePriorityList from '@/components/settings/ExchangePriorityList.vue'
import { useAccountStore } from '@/stores/account'

const props = defineProps<{ readonly?: boolean }>()
const account = useAccountStore()
const pending = useRanchActionLock(account)
const data = ref<any>(null)
const draft = ref<Record<string, boolean>>({})
const policy = ref<any>({})
const exchangeGoods = ref<any[]>([])
const goodsLoading = ref(false)
let goodsRequest = 0
const poopGoods = computed(() => exchangeGoods.value.filter(g => String(g.costItemId) === '7002'))
const pineGoods = computed(() => exchangeGoods.value.filter(g => String(g.costItemId) === '1008'))
const strokeFriends = ref<{ gid: string, name: string }[]>([])
const strokeFriendsLoading = ref(false)
const strokeFriendsError = ref('')
let strokeFriendsRequest = 0
async function loadStrokeFriends() {
  const accountId = account.currentAccountId
  if (!accountId)
    return
  const request = ++strokeFriendsRequest
  strokeFriendsLoading.value = true
  strokeFriendsError.value = ''
  try {
    const res = await api.get('/api/friends', { headers: { 'x-account-id': accountId } })
    if (request !== strokeFriendsRequest)
      return
    const rows = res.data?.ok ? (res.data.data?.friends || []) : []
    strokeFriends.value = rows
      .map((f: any) => ({ gid: String(f?.gid || ''), name: String(f?.nickname || f?.nickName || f?.remark || f?.gid || '') }))
      .filter((f: { gid: string }) => /^[1-9]\d*$/.test(f.gid))
  }
  catch (e: any) {
    if (request === strokeFriendsRequest)
      strokeFriendsError.value = e?.response?.data?.error || e?.message || '好友名单读取失败'
  }
  finally {
    if (request === strokeFriendsRequest)
      strokeFriendsLoading.value = false
  }
}
async function loadExchangeGoods() {
  const accountId = account.currentAccountId
  if (!accountId)
    return
  const request = ++goodsRequest
  goodsLoading.value = true
  try {
    const res = await api.get('/api/ranch/shop', { headers: { 'x-account-id': accountId } })
    if (request !== goodsRequest)
      return
    exchangeGoods.value = res.data?.ok
      ? (res.data.data?.exchangeMarket?.goods || []).filter((g: any) => ['7002', '1008'].includes(String(g.costItemId)))
      : []
  }
  catch {
    if (request === goodsRequest)
      exchangeGoods.value = []
  }
  finally {
    if (request === goodsRequest)
      goodsLoading.value = false
  }
}
const active = ref('')
const loading = ref(false)
const error = ref('')
let generation = 0
let controller: AbortController | null = null
const modules = [
  { key: 'husbandry', title: '养殖与收获', description: '养殖策略、收获、出售和巡查节奏', icon: 'i-carbon-sprout' },
  { key: 'feed', title: '饲料与设施', description: '牧场升级、设施升级和罐头使用', icon: 'i-carbon-wheat' },
  { key: 'friends', title: '牧场好友', description: '帮助、照料和好友捣乱', icon: 'i-carbon-user-multiple' },
  { key: 'steal', title: '牧场偷取', description: '根据好友产出时间自动巡查', icon: 'i-carbon-crop-health' },
  { key: 'merchant', title: '兑换集市', description: '使用便便、松果兑换商品', icon: 'i-carbon-store' },
  { key: 'daily', title: '日常', description: '牧场任务、订单、每日福利与奖励', icon: 'i-carbon-task' },
]
const moduleImages: Record<string, string> = {
  husbandry: 'planting.png',
  feed: 'fertilizer.png',
  friends: 'friends-friendship.png',
  steal: 'steal.png',
  merchant: 'merchant.png',
  daily: 'activity-task.png',
}
const activeInfo = computed(() => modules.find(m => m.key === active.value))
const policyKeys: Record<string, string[]> = {
  husbandry: ['husbandryStrategy', 'husbandryFallbackStrategy', 'farmMin', 'farmMax'],
  feed: ['canStrategy', 'smartSeconds', 'canMaxPerRun', 'feedAnimalMaxPerRun', 'grassThresholdPercent', 'feedTargetCount', 'feedReserveCount'],
  friends: ['helpMin', 'helpMax', 'quietEnabled', 'quietStart', 'quietEnd'],
  steal: [],
  merchant: ['exchangePoopOrder', 'exchangePineOrder'],
  daily: ['strokeIncludeGids'],
}
const husbandryFallbackOptions = [
  { label: '任务幼崽优先（无任务时最高等级）', value: 'task' },
  { label: '最高等级幼崽', value: 'level' },
  { label: '最大基础经验／时', value: 'max_exp' },
  { label: '最大基础产值／时', value: 'max_profit' },
]
const husbandryOptions = [{ label: '牧场幼崽优先（背包优先）', value: 'bag_priority' }, ...husbandryFallbackOptions]
const canOptions = [
  { label: '有机 + 无机', value: 'both' },
  { label: '有机 + 快成熟无机', value: 'smart' },
  { label: '快成熟无机', value: 'smart_only' },
  { label: '快成熟有机', value: 'smart_normal' },
  { label: '仅有机罐头', value: 'normal' },
  { label: '仅无机罐头', value: 'organic' },
  { label: '不使用罐头', value: 'none' },
]
const options = computed(() => [
  { key: 'autoClaimTasks', label: '自动领取每日、成长任务奖励', capability: 'claimTask', module: 'daily' },
  { key: 'autoSubmitOrders', label: '自动提交安全物品订单', capability: 'submitOrder', module: 'daily' },
  { key: 'autoClaimIllustrated', label: '自动领取牧场图鉴奖励', capability: 'claimIllustrated', module: 'daily' },
  { key: 'autoClaimWeight', label: '自动领取重量积分奖励', capability: 'claimWeight', module: 'daily' },
  { key: 'autoDailyBenefit', label: '自动领取每日福利（每日 1 次）', capability: 'dailyBenefit', module: 'daily' },
  { key: 'autoClaimShareReward', label: '每日分享领罐头', capability: 'dailyShareReward', module: 'daily' },
  { key: 'autoPlace', label: '自动入栏', capability: 'place', module: 'husbandry' },
  { key: 'autoAddFeed', label: '自动补充已有牧草', capability: 'addFeed', module: 'feed' },
  { key: 'autoUseCan', label: '自动装填罐头容器', capability: 'useCan', module: 'feed' },
  { key: 'autoUseCanNormal', label: '自动使用无机罐头', capability: 'useCan', module: 'daily' },
  { key: 'autoUseCanOrganic', label: '自动使用有机罐头', capability: 'useCan', module: 'daily' },
  { key: 'autoHelp', label: '自动帮助好友清理灾害', capability: 'friendActions', module: 'friends' },
  { key: 'autoStroke', label: '自动抚摸动物', capability: 'friendActions', module: 'daily' },
  { key: 'autoStrokeSelected', label: '只抚摸勾选的好友', capability: 'friendActions', module: 'daily' },
  { key: 'autoPutHazard', label: '自动向好友牧场放蚊子', capability: 'friendActions', module: 'friends' },
  { key: 'autoSteal', label: '自动偷取好友货架产物', capability: 'friendActions', module: 'steal' },
  { key: 'autoSell', label: '自动出售产物', capability: 'sell', module: 'husbandry' },
  { key: 'autoExchangePoop', label: '使用便便兑换', capability: 'exchange', module: 'merchant' },
  { key: 'autoExchangePine', label: '使用松果兑换', capability: 'exchange', module: 'merchant' },
  { key: 'autoExchangePriority', label: '按下方顺序优先兑换', capability: 'exchange', module: 'merchant' },
  { key: 'autoUpgradeRanch', label: '升级牧场', capability: 'upgradeBuilding', module: 'feed' },
  { key: 'autoUpgradeFacilities', label: '解锁棚与升级设施', capability: 'upgradeBuilding', module: 'feed' },
  { key: 'autoFeedAnimal', label: '自动使用罐头', capability: 'feedAnimal', module: 'feed' },
  { key: 'autoProduceAfterFeed', label: '喂罐头后自动生产', capability: 'feedAnimal', module: 'feed' },
  { key: 'autoProduce', label: '自动开始生产', capability: 'produce', module: 'husbandry' },
  { key: 'autoCollect', label: '自动收集货架产物', capability: 'collect', module: 'husbandry' },
  { key: 'autoClean', label: '自动清理灾害', capability: 'clean', module: 'husbandry' },
  { key: 'autoHarvest', label: '自动收获动物（成熟后离栏）', capability: 'harvest', module: 'husbandry' },
].filter(option => data.value?.capabilities?.[option.capability]))
function enabledCount(key: string) {
  return options.value.filter(o => o.module === key && data.value?.[o.key]).length
}
function moduleOptions(key: string) {
  return options.value.filter(o => o.module === key)
}
async function toggleModule(key: string, value: boolean) {
  if (props.readonly || pending.has(account.currentAccountId))
    return
  edit(key)
  const defaults: Record<string, string[]> = {
    husbandry: ['autoPlace', 'autoProduce', 'autoCollect', 'autoClean', 'autoHarvest'],
    feed: ['autoAddFeed', 'autoUseCan', 'autoFeedAnimal', 'autoProduceAfterFeed'],
    friends: ['autoHelp'],
    daily: ['autoClaimTasks', 'autoSubmitOrders', 'autoClaimIllustrated', 'autoClaimWeight', 'autoDailyBenefit', 'autoClaimShareReward', 'autoStroke'],
  }
  for (const option of moduleOptions(key))
    draft.value[option.key] = value && (defaults[key]?.includes(option.key) ?? true)
  await save()
}
async function load() {
  if (!account.currentAccountId || loading.value)
    return
  const version = generation
  controller = new AbortController()
  loading.value = true
  error.value = ''
  try {
    const res = await api.get('/api/ranch/settings', { signal: controller.signal, headers: { 'x-account-id': account.currentAccountId } })
    if (!res.data.ok)
      throw new Error(res.data.error || '配置读取失败')
    if (version === generation)
      data.value = res.data.data
  }
  catch (e: any) {
    if (version === generation && e.code !== 'ERR_CANCELED')
      error.value = e.response?.data?.error || e.message
  }
  finally {
    if (version === generation)
      loading.value = false
  }
}
function edit(key: string) {
  if (props.readonly)
    return
  active.value = key
  policy.value = JSON.parse(JSON.stringify(data.value?.policy || {}))
  if (key === 'merchant') {
    if (!Array.isArray(policy.value.exchangePoopOrder))
      policy.value.exchangePoopOrder = []
    if (!Array.isArray(policy.value.exchangePineOrder))
      policy.value.exchangePineOrder = []
    void loadExchangeGoods()
  }
  if (key === 'daily') {
    if (!Array.isArray(policy.value.strokeIncludeGids))
      policy.value.strokeIncludeGids = []
    void loadStrokeFriends()
  }
  draft.value = Object.fromEntries(options.value.map(o => [o.key, data.value?.[o.key] === true]))
}
function toggleStrokeGid(gid: string) {
  if (props.readonly)
    return
  const list: string[] = Array.isArray(policy.value.strokeIncludeGids) ? policy.value.strokeIncludeGids : []
  policy.value.strokeIncludeGids = list.includes(gid) ? list.filter(id => id !== gid) : [...list, gid]
}
async function save() {
  if (props.readonly || !account.currentAccountId || loading.value || pending.has(account.currentAccountId))
    return
  const accountId = account.currentAccountId
  const version = generation
  pending.add(accountId)
  loading.value = true
  error.value = ''
  try {
    const isDaily = active.value === 'daily'
    const switches = Object.fromEntries(moduleOptions(active.value)
      .filter(o => !isDaily || draft.value[o.key] !== (data.value?.[o.key] === true))
      .map(o => [o.key, draft.value[o.key]]))
    // 日常里除了开关还有「只抚摸勾选的好友」名单，需要一并提交策略；只带该字段，不覆盖其它策略。
    const dailyPolicy: Record<string, unknown> = {}
    for (const key of policyKeys.daily || []) {
      const next = policy.value?.[key] ?? []
      const prev = data.value?.policy?.[key] ?? []
      if (JSON.stringify(next) !== JSON.stringify(prev))
        dailyPolicy[key] = next
    }
    if (isDaily && !Object.keys(switches).length && !Object.keys(dailyPolicy).length) {
      active.value = ''
      return
    }
    const patch = isDaily
      ? { ...switches, ...(Object.keys(dailyPolicy).length ? { policy: dailyPolicy } : {}) }
      : { ...switches, policy: { mode: 'simple', ...Object.fromEntries((policyKeys[active.value] || []).map(key => [key, policy.value[key]])) } }
    const res = await api.post('/api/ranch/settings', patch, { headers: { 'x-account-id': accountId } })
    if (!res.data.ok)
      throw new Error(res.data.error || '保存失败')
    if (version === generation) {
      data.value = res.data.data
      active.value = ''
    }
  }
  catch (e: any) {
    if (version === generation)
      error.value = e.response?.data?.error || e.message
  }
  finally {
    pending.delete(accountId)
    if (version === generation)
      loading.value = false
  }
}
watch(() => account.currentAccountId, () => {
  generation++
  controller?.abort()
  active.value = ''
  data.value = null
  draft.value = {}
  policy.value = {}
  loading.value = false
  exchangeGoods.value = []
  goodsRequest += 1
  void load()
}, { immediate: true, flush: 'sync' })
onUnmounted(() => {
  generation++
  controller?.abort()
})
</script>

<template>
  <section class="ranch-settings space-y-4">
    <p v-if="error" class="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
      {{ error }}
    </p>
    <p v-if="!account.currentAccountId" class="ui-card rounded-lg p-6">
      请先选择账号
    </p>
    <Teleport to="body">
      <div v-if="active && activeInfo && account.currentAccountId" class="fixed inset-0 z-[200] grid place-items-center overflow-y-auto bg-gray-950/45 p-3 backdrop-blur-[2px] sm:p-6" @click.self="!loading && (active = '')">
        <article role="dialog" aria-modal="true" aria-labelledby="ranch-config-title" class="ranch-config-modal max-h-[94vh] max-w-4xl w-full flex flex-col overflow-hidden border border-gray-200 rounded-lg bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <header class="shrink-0 flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-700 sm:px-6">
            <div class="min-w-0 flex items-center gap-3">
              <img v-if="moduleImages[active]" :src="`/game-config/module_icons/${moduleImages[active]}`" alt="" class="h-11 w-11 shrink-0 rounded-lg bg-gray-100 object-contain p-1.5 dark:bg-gray-700">
              <span v-else class="inline-grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gray-100 text-xl dark:bg-gray-700"><span :class="activeInfo.icon" /></span>
              <div class="min-w-0">
                <h3 id="ranch-config-title" class="text-lg text-gray-900 font-semibold dark:text-gray-100">
                  {{ activeInfo.title }}
                </h3>
                <p class="mt-1 text-sm text-gray-500">
                  {{ activeInfo.description }}
                </p>
              </div>
            </div>
            <button aria-label="关闭配置" :disabled="loading" class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-700" @click="active = ''">
              <span class="i-carbon-close text-xl" />
            </button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <p v-if="error" class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300" role="alert">
              {{ error }}
            </p>
            <div v-if="options.some(o => o.module === active)" class="space-y-5">
              <section class="ranch-config-switch-panel border border-white/70 rounded-xl p-4 dark:border-white/10">
                <h4 class="mb-3 flex items-center gap-2 text-sm font-medium">
                  <span :class="activeInfo.icon" />{{ active === 'merchant' ? '允许使用的货币' : active === 'friends' ? '好友互动' : '基础功能' }}
                </h4>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div v-for="option in options.filter(o => o.module === active)" :key="option.key" class="min-w-0">
                    <BaseSwitch v-model="draft[option.key]" :label="option.label" :disabled="loading" />
                    <p v-if="option.key === 'autoExchangePriority'" class="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      开启后按下方顺序逐个检查：能换就换，换不了就等着数量攒够，不会跳过它先去换后面的商品。便便与松果是两种货币，各自排队互不影响。
                    </p>
                    <p v-if="option.key === 'autoClaimShareReward'" class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      在游戏内完成每日首次分享后自动检查并领取罐头（1 小时）×5，不会代你分享。
                    </p>
                    <p v-if="option.key === 'autoUseCanNormal' || option.key === 'autoUseCanOrganic'" class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      只使用背包里这一种罐头把它们用掉，与上面的「罐头使用策略」互不影响。
                    </p>
                    <p v-if="option.key === 'autoProduceAfterFeed'" class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      用罐头喂动物后，如果动物此时可以生产，会自动让它开始生产；只在「自动使用罐头」真正执行时触发。
                    </p>
                  </div>
                </div>
              </section>
              <template v-if="active === 'merchant' && draft.autoExchangePriority && (draft.autoExchangePoop || draft.autoExchangePine)">
                <section v-if="draft.autoExchangePoop" class="space-y-2 border border-gray-100 rounded-lg p-4 dark:border-gray-700">
                  <h3 class="text-lg font-bold">
                    便便兑换顺序
                  </h3>
                  <p v-if="goodsLoading" class="text-sm text-gray-500">
                    正在读取兑换集市商品…
                  </p>
                  <ExchangePriorityList v-model="policy.exchangePoopOrder" title="便便兑换" cost-name="便便" :goods="poopGoods" :loading="goodsLoading" :disabled="loading" />
                </section>
                <section v-if="draft.autoExchangePine" class="space-y-2 border border-gray-100 rounded-lg p-4 dark:border-gray-700">
                  <h3 class="text-lg font-bold">
                    松果兑换顺序
                  </h3>
                  <ExchangePriorityList v-model="policy.exchangePineOrder" title="松果兑换" cost-name="松果" :goods="pineGoods" :loading="goodsLoading" :disabled="loading" />
                </section>
                <p class="text-xs leading-relaxed text-gray-500">
                  拖拽卡片调整顺序，或用 ↑ 置顶；价格显示的是折扣后的实际花费，达到限购上限后该商品会自动跳过。
                </p>
              </template>
              <section v-if="active === 'husbandry'" class="border border-gray-100 rounded-lg p-4 space-y-4 dark:border-gray-700">
                <h3 class="text-lg font-bold">
                  养殖策略与巡查频率
                </h3>
                <BaseSelect v-model="policy.husbandryStrategy" label="第一策略" :options="husbandryOptions" :disabled="loading" />
                <BaseSelect v-if="policy.husbandryStrategy === 'bag_priority'" v-model="policy.husbandryFallbackStrategy" label="第二策略" :options="husbandryFallbackOptions" :disabled="loading" />
                <p class="text-xs text-gray-500">
                  牧场幼崽优先使用背包中适合当前栏舍的幼崽，耗尽后按第二策略购买；其他策略从已解锁的金券幼崽中选择，购买后直接入栏；基础经验与产值按官方配置估算，不计增益、变异和饲料中断。
                </p>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseInput v-model.number="policy.farmMin" label="牧场巡查最小（秒）" type="number" min="1" :disabled="loading" />
                  <BaseInput v-model.number="policy.farmMax" label="牧场巡查最大（秒）" type="number" min="1" :disabled="loading" />
                </div>
              </section>
              <section v-if="active === 'daily' && draft.autoStrokeSelected" class="border border-gray-100 rounded-lg p-4 space-y-2 dark:border-gray-700">
                <h3 class="text-lg font-bold">
                  抚摸指定好友
                </h3>
                <p class="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  只在勾选的好友牧场里抚摸动物；一个都没勾选时不会抚摸任何人。
                </p>
                <p v-if="strokeFriendsLoading" class="flex items-center gap-2 text-sm text-gray-500">
                  <span class="i-svg-spinners-ring-resize animate-spin" />正在读取好友名单…
                </p>
                <p v-else-if="strokeFriendsError" class="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                  {{ strokeFriendsError }}
                  <button class="ml-2 underline" @click="loadStrokeFriends">重试</button>
                </p>
                <p v-else-if="!strokeFriends.length" class="text-sm text-gray-500">
                  还没有好友名单，请先在「好友」页同步一次好友。
                </p>
                <div v-else class="max-h-64 grid gap-2 overflow-y-auto sm:grid-cols-2">
                  <button v-for="friend in strokeFriends" :key="friend.gid" type="button" class="min-w-0 flex items-center gap-2 border rounded-lg px-3 py-2 text-left text-sm transition" :class="(policy.strokeIncludeGids || []).includes(friend.gid) ? 'border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_10%,transparent)]' : 'border-gray-200 hover:border-[var(--theme-primary)] dark:border-gray-700'" @click="toggleStrokeGid(friend.gid)">
                    <span class="grid h-5 w-5 shrink-0 place-items-center border rounded-full text-xs" :class="(policy.strokeIncludeGids || []).includes(friend.gid) ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white' : 'border-gray-300 text-transparent dark:border-gray-600'">
                      <span class="i-carbon-checkmark text-sm" />
                    </span>
                    <span class="min-w-0 truncate">{{ friend.name }}</span>
                    <span class="ml-auto shrink-0 text-xs text-gray-400">{{ friend.gid }}</span>
                  </button>
                </div>
                <p class="text-xs text-gray-500">
                  已勾选 {{ (policy.strokeIncludeGids || []).length }} 人
                </p>
              </section>
              <section v-if="active === 'feed'" class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSelect v-model="policy.canStrategy" label="罐头使用策略" :options="canOptions" :disabled="loading" />
                  <BaseInput v-if="['smart', 'smart_only', 'smart_normal'].includes(policy.canStrategy)" v-model.number="policy.smartSeconds" label="快成熟判定秒数" type="number" min="30" max="3600" :disabled="loading" />
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseInput v-model.number="policy.canMaxPerRun" label="单次装罐上限（个）" type="number" min="1" max="99" :disabled="loading" />
                  <BaseInput v-model.number="policy.feedAnimalMaxPerRun" label="每轮喂动物上限（次）" type="number" min="1" max="99" :disabled="loading" />
                </div>
                <p class="text-xs text-gray-500">
                  「单次装罐上限」控制自动装填罐头容器时每种罐头每轮最多装几个，实际数量还受容器缺口与库存预留限制，默认 1 个；「每轮喂动物上限」控制「自动使用罐头」每轮最多给几只动物使用罐头容器，默认 1 次，避免一次巡查把库存罐头喂完。
                </p>
                <div class="grid gap-3 sm:grid-cols-3">
                  <BaseInput v-model.number="policy.grassThresholdPercent" label="牧草机余量低于（%）时补草" type="number" min="1" max="100" :disabled="loading" />
                  <BaseInput v-model.number="policy.feedTargetCount" label="单次补草上限" type="number" min="1" max="999999" :disabled="loading" />
                  <BaseInput v-model.number="policy.feedReserveCount" label="库存牧草预留量" type="number" min="0" max="999999" :disabled="loading" />
                </div>
                <p class="text-xs text-gray-500">
                  开启“自动补充已有牧草”后，牧草机余量低于阈值才补草。补草量取剩余容量、单次上限和扣除预留量后的可用库存中的最小值。只使用库存牧草。罐头使用策略与自动补草独立。
                </p>
              </section>
              <section v-if="active === 'friends'" class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseInput v-model.number="policy.helpMin" label="帮助巡查最小（秒）" type="number" min="1" :disabled="loading" />
                  <BaseInput v-model.number="policy.helpMax" label="帮助巡查最大（秒）" type="number" min="1" :disabled="loading" />
                </div>
                <BaseSwitch v-model="policy.quietEnabled" label="启用静默时段" :disabled="loading" />
                <div v-if="policy.quietEnabled" class="grid gap-3 sm:grid-cols-2">
                  <BaseInput v-model="policy.quietStart" label="开始时间（北京时间）" type="time" :disabled="loading" />
                  <BaseInput v-model="policy.quietEnd" label="结束时间（北京时间）" type="time" :disabled="loading" />
                </div>
              </section>
              <section v-if="active === 'steal'" class="border border-gray-100 rounded-lg bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-900/25">
                <h4 class="mb-2 text-sm font-medium">
                  巡查节奏说明
                </h4>
                <p class="text-xs text-gray-500">
                  根据已知好友动物的产出时间自动安排巡查，并轮转校准未知状态，无需设置固定偷取间隔。
                </p>
              </section>
              <p class="text-xs text-gray-500">
                仅对已启动账号执行；不使用未开放的付费资源。
              </p>
            </div><div v-else class="mt-4 space-y-3">
              <p class="text-sm text-gray-500">
                该模块自动化暂不可用。
              </p><BaseButton variant="secondary" @click="active = ''">
                返回
              </BaseButton>
            </div>
          </div>
          <footer class="shrink-0 flex justify-end gap-2 border-t border-gray-200/70 bg-white/40 px-5 py-4 dark:border-gray-700 dark:bg-gray-900/20">
            <BaseButton class="settings-frost-button" variant="secondary" :disabled="loading" @click="active = ''">取消</BaseButton>
            <BaseButton class="settings-frost-button" :loading="loading" :disabled="!options.some(o => o.module === active)" @click="save">保存并关闭</BaseButton>
          </footer>
        </article>
      </div>
    </Teleport>
    <div v-if="account.currentAccountId" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="module in modules" :key="module.key" class="group min-h-[184px] flex flex-col border border-gray-200 rounded-lg bg-white p-4 transition dark:border-gray-700 hover:border-[var(--theme-primary)] dark:bg-gray-800 hover:shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex items-center gap-3">
            <img v-if="moduleImages[module.key]" :src="`/game-config/module_icons/${moduleImages[module.key]}`" alt="" class="h-10 w-10 shrink-0 rounded-lg bg-gray-100 object-contain p-1.5 dark:bg-gray-700">
            <span v-else class="inline-grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gray-100 text-xl dark:bg-gray-700"><span :class="module.icon" /></span>
            <div class="min-w-0">
              <h4 class="text-gray-900 font-semibold dark:text-gray-100">
                {{ module.title }}
              </h4>
              <p class="mt-0.5 text-xs text-gray-500">
                {{ module.description }}
              </p>
            </div>
          </div>
          <BaseSwitch :aria-label="`${module.title}自动化`" :model-value="enabledCount(module.key) > 0" :disabled="props.readonly || loading || !data || pending.has(account.currentAccountId)" @update:model-value="toggleModule(module.key, !!$event)" />
        </div>
        <div class="mt-4 min-h-[56px] flex flex-wrap content-start gap-2">
          <span v-for="option in moduleOptions(module.key).filter(o => data?.[o.key])" :key="option.key" class="max-w-full rounded-md bg-gray-50 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">{{ option.label }}</span>
          <span v-if="!enabledCount(module.key)" class="rounded-md bg-gray-50 px-2.5 py-1 text-xs text-gray-500 dark:bg-gray-900/40">{{ loading && !data ? '读取配置中…' : moduleOptions(module.key).length ? '未开启动作' : '暂不可用' }}</span>
        </div>
        <div class="mt-auto flex items-center justify-between pt-4">
          <span class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span class="h-2 w-2 rounded-full" :class="enabledCount(module.key) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'" />
            {{ enabledCount(module.key) ? `${enabledCount(module.key)} 项已开启` : '未开启' }}
          </span>
          <BaseButton class="settings-frost-button" variant="secondary" size="sm" :disabled="props.readonly || loading || !data || pending.has(account.currentAccountId)" @click="edit(module.key)">
            配置
          </BaseButton>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.ranch-config-modal {
  max-height: calc(100dvh - 2rem);
  border-radius: 1rem;
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.6)) !important;
  border: 1px solid rgba(255, 255, 255, 0.85) !important;
  box-shadow: 0 8px 32px rgba(31, 38, 80, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.85) !important;
  backdrop-filter: blur(24px) saturate(1.35);
  -webkit-backdrop-filter: blur(24px) saturate(1.35);
}
.ranch-config-modal > div { overscroll-behavior: contain; scrollbar-gutter: stable; }
.ranch-config-modal section { background: rgba(255, 255, 255, 0.55); }
.ranch-config-modal .ranch-config-switch-panel {
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.48));
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 4px 16px rgba(31, 38, 80, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
}
.settings-frost-button {
  border: 1px solid color-mix(in srgb, var(--theme-primary) 25%, rgba(255,255,255,0.8)) !important;
  box-shadow: 0 3px 14px color-mix(in srgb, var(--theme-primary) 12%, transparent), inset 0 1px 1px rgba(255,255,255,0.65) !important;
  backdrop-filter: blur(16px) saturate(1.2);
}
.ranch-settings .settings-frost-button {
  color: var(--theme-primary) !important;
  background: color-mix(in srgb, var(--theme-primary) 9%, rgba(255,255,255,0.7)) !important;
}
:global(.dark) .ranch-config-modal { background: linear-gradient(165deg, rgba(31, 41, 55, 0.85), rgba(31, 41, 55, 0.72)) !important; border-color: rgba(255,255,255,0.12) !important; }
:global(.dark) .ranch-config-modal section { background: rgba(255,255,255,0.06); }
:global(.dark) .ranch-config-modal .ranch-config-switch-panel {
  background: linear-gradient(165deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04));
  border-color: rgba(255,255,255,0.12);
}
</style>
