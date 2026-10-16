<script setup lang="ts">
import type { RuntimeLogEntry } from '@/utils/runtime-log'
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { useAccountStore } from '@/stores/account'
import { useBagStore } from '@/stores/bag'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'
import { formatCouponAmount, formatGoldAmount, formatGoldBeanAmount } from '@/utils/number-format'
import { compactRuntimeLogs, matchesRuntimeLog, normalizeRuntimeLog } from '@/utils/runtime-log'

const statusStore = useStatusStore()
const accountStore = useAccountStore()
const bagStore = useBagStore()
const toastStore = useToastStore()

const {
  status,
  logs: statusLogs,
  accountLogs: statusAccountLogs,
  realtimeConnected,
  currentStatusReady,
} = storeToRefs(statusStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { dashboardItems } = storeToRefs(bagStore)

const logContainer = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const lastBagFetchAt = ref(0)
const illustratedLevels = ref({ crop: 0, mutant: 0 })
let illustratedLevelRequestId = 0
const clearingLogs = ref(false)
const refreshingLogs = ref(false)
const pendingLogCount = ref(0)
const logScrollStates = new Map<string, { top: number, atBottom: boolean }>()

const filter = reactive({
  module: '',
  event: '',
  keyword: '',
})

const hasActiveLogFilter = computed(() =>
  !!(filter.module || filter.event || filter.keyword),
)
const currentAccountDisconnected = computed(() =>
  currentStatusReady.value && !status.value?.connection?.connected,
)

const allLogs = computed(() => {
  const merged = [
    ...(statusLogs.value || []).map((log: any) => normalizeRuntimeLog(log)),
    ...(statusAccountLogs.value || []).map((log: any) => normalizeRuntimeLog(log, true)),
  ]
  const unique = new Map<string, RuntimeLogEntry>()
  for (const log of merged)
    unique.set(log.id, log)
  return [...unique.values()].sort((a, b) => a.ts - b.ts)
})

const filteredLogs = computed(() => allLogs.value.filter((log) => {
  return matchesRuntimeLog(log, filter)
}))

const visibleLogs = computed(() => compactRuntimeLogs(filteredLogs.value))

const modules = [
  { label: '全部模块', value: '' },
  { label: '农场', value: 'farm' },
  { label: '好友', value: 'friend' },
  { label: '仓库', value: 'warehouse' },
  { label: '商城', value: 'shop' },
  { label: '任务', value: 'task' },
  { label: '活动', value: 'activity' },
  { label: '宠物', value: 'pet' },
  { label: '系统', value: 'system' },
]

const events = [
  { label: '全部事件', value: '' },
  { label: '农场巡查', value: '农场循环' },
  { label: '收获作物', value: '收获作物' },
  { label: '清理枯枝', value: '铲除植物' },
  { label: '种植种子', value: '种植种子' },
  { label: '施加化肥', value: '施肥' },
  { label: '土地提醒', value: '土地推送通知' },
  { label: '选择种子', value: '选择种子' },
  { label: '购买种子', value: '购买种子' },
  { label: '购买化肥', value: '购买化肥' },
  { label: '开启礼盒', value: '开启化肥礼包' },
  { label: '获取任务', value: '扫描任务' },
  { label: '完成任务', value: '领取任务' },
  { label: '免费礼包', value: 'mall_free_gifts' },
  { label: '分享奖励', value: 'daily_share' },
  { label: '会员礼包', value: 'vip_daily_gift' },
  { label: '月卡礼包', value: 'month_card_gift' },
  { label: '图鉴奖励', value: '图鉴奖励' },
  { label: '邮箱领取', value: 'email_rewards' },
  { label: '出售成功', value: 'sell_success' },
  { label: '神秘商人', value: '神秘商人自动购买' },
  { label: '土地升级', value: '升级土地' },
  { label: '土地解锁', value: '解锁土地' },
  { label: '好友巡查', value: '好友巡查循环' },
  { label: '访问好友', value: '进入农场' },
  { label: '激活宠物', value: '激活宠物' },
  { label: '派出宠物', value: '派出宠物' },
  { label: '召回宠物', value: '召回宠物' },
  { label: '喂食宠物', value: '喂食宠物' },
  { label: '资本模式派出', value: '资本模式派出' },
  { label: '资本模式召回', value: '资本模式召回' },
]

const eventLabelMap: Record<string, string> = Object.fromEntries(
  events.filter(event => event.value).map(event => [event.value, event.label]),
)

const displayName = computed(() => {
  const account = accountStore.currentAccount
  const gameName = status.value?.status?.name

  if (gameName) {
    if (account?.name)
      return `${gameName} (${account.name})`
    return gameName
  }

  if (currentAccountDisconnected.value) {
    if (account) {
      if (account.name && account.nick)
        return `${account.nick} (${account.name})`
      return account.name || account.nick || '未登录'
    }
    return '未登录'
  }

  if (account) {
    if (account.name && account.nick)
      return `${account.nick} (${account.name})`
    return account.name || account.nick || '未命名'
  }

  return '未命名'
})

const expRate = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  if (!uptime)
    return '0/小时'
  const rate = gain / (uptime / 3600)
  return `${Math.floor(rate)}/小时`
})

const timeToLevel = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  const current = status.value?.levelProgress?.current || 0
  const needed = status.value?.levelProgress?.needed || 0

  if (!needed || !uptime || gain <= 0)
    return ''

  const ratePerHour = gain / (uptime / 3600)
  if (ratePerHour <= 0)
    return ''

  const expNeeded = Math.max(0, needed - current)
  const minsToLevel = expNeeded / (ratePerHour / 60)

  if (minsToLevel < 60)
    return `约 ${Math.ceil(minsToLevel)} 分钟后升级`
  return `约 ${(minsToLevel / 60).toFixed(1)} 小时后升级`
})

const fertilizerNormal = computed(() => dashboardItems.value.find((item: any) => Number(item.id) === 1011))
const fertilizerOrganic = computed(() => dashboardItems.value.find((item: any) => Number(item.id) === 1012))

const resourceCards = computed(() => [
  {
    key: 'gold',
    label: '金币',
    icon: '/game-config/resource-icons/gold.png',
    amount: formatGoldAmount(status.value?.status?.gold || 0),
  },
  {
    key: 'coupon',
    label: '点券',
    icon: '/game-config/resource-icons/coupon.png',
    amount: formatCouponAmount(status.value?.status?.coupon || 0),
  },
  {
    key: 'diamond',
    label: '钻石',
    icon: '/game-config/resource-icons/diamond.png',
    amount: formatCouponAmount(status.value?.status?.diamond || 0),
  },
  {
    key: 'bean',
    label: '金豆',
    icon: '/game-config/resource-icons/gold-bean.png',
    amount: formatGoldBeanAmount(status.value?.status?.goldBean || 0),
  },
  {
    key: 'fert-normal',
    label: '普通肥',
    icon: '/game-config/resource-icons/fertilizer-normal.png',
    amount: formatBucketTime(fertilizerNormal.value),
  },
  {
    key: 'fert-organic',
    label: '有机肥',
    icon: '/game-config/resource-icons/fertilizer-organic.png',
    amount: formatBucketTime(fertilizerOrganic.value),
  },
  {
    key: 'crop',
    label: '作物图鉴',
    icon: '/game-config/resource-icons/illustrated-crop.png',
    amount: `Lv.${illustratedLevels.value.crop}`,
  },
  {
    key: 'mutant',
    label: '超变图鉴',
    icon: '/game-config/resource-icons/illustrated-mutant.png',
    amount: `Lv.${illustratedLevels.value.mutant}`,
  },
])

const featureCards = computed(() => [
  {
    key: 'crop',
    title: '作物图鉴',
    subtitle: `Lv.${illustratedLevels.value.crop}`,
    icon: '/dashboard/icon-crop.png',
    to: '/illustrated',
  },
  {
    key: 'pet',
    title: '宠物',
    subtitle: `Lv.${illustratedLevels.value.mutant}`,
    icon: '/dashboard/icon-pet.png',
    to: '/pet',
  },
  {
    key: 'book',
    title: '图鉴',
    subtitle: '收集进度',
    icon: '/dashboard/icon-book.png',
    to: '/illustrated',
  },
  {
    key: 'shop',
    title: '商城',
    subtitle: '道具 / 装扮',
    icon: '/dashboard/icon-shop.png',
    to: '/shop',
  },
  {
    key: 'gift',
    title: '活动',
    subtitle: '精彩活动',
    icon: '/dashboard/icon-gift.png',
    to: '/activity',
  },
  {
    key: 'chart',
    title: '分析',
    subtitle: '数据统计',
    icon: '/dashboard/icon-chart.png',
    to: '/analytics',
  },
])

const nextFarmCheck = ref('--:--:--')
const nextHelpCheck = ref('--:--:--')
const nextStealCheck = ref('--:--:--')
const localUptime = ref(0)

let localNextFarmRemainSec = 0
let localNextHelpRemainSec = 0
let localNextStealRemainSec = 0
const farmCountdownTotal = ref(1)
const helpCountdownTotal = ref(1)
const stealCountdownTotal = ref(1)

function resetDashboardState() {
  illustratedLevelRequestId += 1
  illustratedLevels.value = { crop: 0, mutant: 0 }
  lastBagFetchAt.value = 0
  localUptime.value = 0
  localNextFarmRemainSec = 0
  localNextHelpRemainSec = 0
  localNextStealRemainSec = 0
  farmCountdownTotal.value = 1
  helpCountdownTotal.value = 1
  stealCountdownTotal.value = 1
  nextFarmCheck.value = '--:--:--'
  nextHelpCheck.value = '--:--:--'
  nextStealCheck.value = '--:--:--'
}

function syncCountdownTotal(total: typeof farmCountdownTotal, remain: number, previousRemain: number) {
  if (remain > previousRemain || total.value <= 1)
    total.value = Math.max(1, remain)
}

function getCountdownProgress(remain: number, total: number) {
  return Math.max(0, Math.min(100, (remain / Math.max(1, total)) * 100))
}

function getCountdownRingStyle(remain: number, total: number, color: string) {
  const progress = getCountdownProgress(remain, total)
  return {
    background: `conic-gradient(${color} ${progress}%, color-mix(in srgb, ${color} 14%, transparent) 0)`,
  }
}

const OP_META: Record<string, { label: string, icon: string, color: string }> = {
  harvest: { label: '收获', icon: 'i-carbon-crop-growth', color: 'text-green-500' },
  water: { label: '浇水', icon: 'i-carbon-rain-drop', color: 'text-blue-400' },
  weed: { label: '除草', icon: 'i-carbon-cut', color: 'text-yellow-500' },
  bug: { label: '除虫', icon: 'i-carbon-pest', color: 'text-red-400' },
  farming: { label: '一键务农', icon: 'i-carbon-clean', color: 'text-teal-500' },
  fertilize: { label: '施肥', icon: 'i-carbon-chemistry', color: 'text-emerald-500' },
  plant: { label: '种植', icon: 'i-carbon-tree', color: 'text-lime-500' },
  steal: { label: '偷菜', icon: 'i-carbon-run', color: 'text-orange-500' },
  helpWater: { label: '帮浇水', icon: 'i-carbon-rain-drop', color: 'text-blue-300' },
  goldenBugClear: { label: '清黄金虫', icon: 'i-carbon-clean', color: 'text-amber-500' },
  goldenBugPut: { label: '放黄金虫', icon: 'i-carbon-pest', color: 'text-yellow-500' },
  helpWeed: { label: '帮除草', icon: 'i-carbon-cut', color: 'text-yellow-400' },
  helpBug: { label: '帮除虫', icon: 'i-carbon-pest', color: 'text-red-300' },
  taskClaim: { label: '任务', icon: 'i-carbon-task-complete', color: 'text-indigo-500' },
  sell: { label: '出售', icon: 'i-carbon-shopping-cart', color: 'text-pink-500' },
  tongQiGift: { label: '同气礼包', icon: 'i-carbon-gift', color: 'text-rose-500' },
}

const filteredOperations = computed(() => {
  const operations = status.value?.operations || {}
  const result: Record<string, number> = {}

  for (const key of Object.keys(operations)) {
    if (key !== 'upgrade' && key !== 'levelUp')
      result[key] = operations[key]
  }

  return result
})

function getEventLabel(event: string) {
  return eventLabelMap[event] || event
}

function formatBucketTime(item: any) {
  if (!item)
    return '0.0h'
  if (item.hoursText)
    return item.hoursText.replace('小时', 'h')
  return `${(Number(item.count || 0) / 3600).toFixed(1)}h`
}

function updateCountdowns() {
  if (currentAccountDisconnected.value) {
    nextFarmCheck.value = '账号未登录'
    nextHelpCheck.value = '账号未登录'
    nextStealCheck.value = '账号未登录'
    return
  }

  localUptime.value++

  if (localNextFarmRemainSec > 0) {
    localNextFarmRemainSec--
    nextFarmCheck.value = formatDuration(localNextFarmRemainSec)
  }
  else {
    nextFarmCheck.value = '检查中...'
  }

  if (localNextHelpRemainSec > 0) {
    localNextHelpRemainSec--
    nextHelpCheck.value = formatDuration(localNextHelpRemainSec)
  }
  else {
    nextHelpCheck.value = '检查中...'
  }

  if (localNextStealRemainSec > 0) {
    localNextStealRemainSec--
    nextStealCheck.value = formatDuration(localNextStealRemainSec)
  }
  else {
    nextStealCheck.value = '检查中...'
  }
}

watch(status, (newVal) => {
  if (newVal?.nextChecks) {
    const farmRemainSec = newVal.nextChecks.farmRemainSec || 0
    const helpRemainSec = newVal.nextChecks.helpRemainSec || 0
    const stealRemainSec = newVal.nextChecks.stealRemainSec || 0
    syncCountdownTotal(farmCountdownTotal, farmRemainSec, localNextFarmRemainSec)
    syncCountdownTotal(helpCountdownTotal, helpRemainSec, localNextHelpRemainSec)
    syncCountdownTotal(stealCountdownTotal, stealRemainSec, localNextStealRemainSec)
    localNextFarmRemainSec = farmRemainSec
    localNextHelpRemainSec = helpRemainSec
    localNextStealRemainSec = stealRemainSec
    updateCountdowns()
  }

  if (newVal?.uptime !== undefined)
    localUptime.value = newVal.uptime
}, { deep: true })

function formatDuration(seconds: number) {
  if (seconds <= 0)
    return '00:00:00'

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainSeconds = Math.floor(seconds % 60)
  const pad = (value: number) => value.toString().padStart(2, '0')

  if (days > 0)
    return `${days}天 ${pad(hours)}:${pad(minutes)}:${pad(remainSeconds)}`
  return `${pad(hours)}:${pad(minutes)}:${pad(remainSeconds)}`
}

function getLogTagClass(tag: string) {
  if (tag === '错误')
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (tag === '系统')
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (tag === '活动')
    return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
  if (tag === '宠物')
    return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
  if (tag === '警告')
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
}

function getLogRowClass(log: RuntimeLogEntry) {
  if (log.level === 'error')
    return 'border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20'
  if (log.level === 'warn')
    return 'border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20'
  return 'border-transparent hover:bg-white/55 dark:hover:bg-gray-800/45'
}

function getLogMsgClass(tag: string) {
  if (tag === '错误')
    return 'text-red-600 dark:text-red-400'
  return 'text-gray-700 dark:text-gray-300'
}

function formatLogTime(timeStr: string) {
  if (!timeStr)
    return ''
  const parts = timeStr.split(' ')
  return parts.length > 1 ? parts[1] : timeStr
}

function formatLogTimeRange(log: RuntimeLogEntry) {
  const start = formatLogTime(log.time)
  if (!log.lastTs || log.lastTs === log.ts)
    return start
  return `${start}–${new Date(log.lastTs).toLocaleTimeString('zh-CN', { hour12: false })}`
}

function getLogScrollStateKey() {
  return [currentAccountId.value, filter.module, filter.event, filter.keyword].join('|')
}

function restoreLogScroll() {
  nextTick(() => {
    const element = logContainer.value
    if (!element)
      return
    const saved = logScrollStates.get(getLogScrollStateKey())
    if (saved && !saved.atBottom) {
      element.scrollTop = saved.top
      autoScroll.value = false
    }
    else {
      scrollToBottom()
    }
  })
}

async function refreshRuntimeLogs() {
  if (!currentAccountId.value || refreshingLogs.value)
    return
  refreshingLogs.value = true
  try {
    await Promise.all([
      statusStore.fetchLogs(currentAccountId.value, { limit: 300 }),
      statusStore.fetchAccountLogs(currentAccountId.value, 300),
    ])
    toastStore.success('日志已刷新')
  }
  finally {
    refreshingLogs.value = false
  }
}

function getOpName(key: string | number) {
  return OP_META[String(key)]?.label || String(key)
}

function getOpIcon(key: string | number) {
  return OP_META[String(key)]?.icon || 'i-carbon-circle-dash'
}

function getOpColor(key: string | number) {
  return OP_META[String(key)]?.color || 'text-gray-400'
}

function getExpPercent(progress: any) {
  if (!progress || !progress.needed)
    return 0
  return Math.min(100, Math.max(0, (progress.current / progress.needed) * 100))
}

async function refreshBag(force = false) {
  if (!currentAccountId.value || !currentAccount.value?.running || !currentStatusReady.value || !status.value?.connection?.connected)
    return

  const now = Date.now()
  if (!force && now - lastBagFetchAt.value < 2500)
    return

  lastBagFetchAt.value = now
  await bagStore.fetchBag(currentAccountId.value)
}

async function refreshIllustratedLevels() {
  if (!currentAccountId.value || !status.value?.connection?.connected)
    return

  const accountId = currentAccountId.value
  const requestId = ++illustratedLevelRequestId
  const headers = { 'x-account-id': accountId }
  try {
    const [crop, mutant] = await Promise.all([
      api.get('/api/illustrated', { params: { illustrated_type: 1 }, headers }),
      api.get('/api/illustrated', { params: { illustrated_type: 2 }, headers }),
    ])
    if (requestId !== illustratedLevelRequestId || accountId !== currentAccountId.value)
      return
    illustratedLevels.value = {
      crop: Number(crop.data?.data?.level) || 0,
      mutant: Number(mutant.data?.data?.level) || 0,
    }
  }
  catch {
    if (requestId === illustratedLevelRequestId)
      illustratedLevels.value = { crop: 0, mutant: 0 }
  }
}

async function refresh(forceReloadLogs = false) {
  if (!currentAccountId.value)
    return

  const account = currentAccount.value
  if (!account)
    return

  // 首次加载、断线回退时走 HTTP；实时连接正常时优先依赖 WS 推送。
  if (!realtimeConnected.value) {
    await statusStore.fetchStatus(currentAccountId.value)
    await statusStore.fetchAccountLogs(currentAccountId.value)
  }

  if (forceReloadLogs || !realtimeConnected.value)
    await statusStore.fetchLogs(currentAccountId.value, { limit: 300 })

  // 仅在账号运行且连接稳定后再拉背包，避免启动阶段出现 500。
  await refreshBag()
}

function syncRealtimeAccount() {
  if (currentAccountId.value)
    statusStore.connectRealtime(currentAccountId.value)
}

function onLogFilterChange() {
  pendingLogCount.value = 0
  restoreLogScroll()
}

function onLogSearchTrigger() {
  pendingLogCount.value = 0
  restoreLogScroll()
}

watch(currentAccountId, async (newId, oldId) => {
  if (oldId !== undefined && newId !== oldId) {
    statusStore.clearAccountScopedData()
    bagStore.clearBag()
    resetDashboardState()
  }
  syncRealtimeAccount()
  await refresh(true)
  await refreshIllustratedLevels()
  scrollToBottom()
})

watch(() => status.value?.connection?.connected, (connected) => {
  if (connected) {
    refreshBag(true)
    refreshIllustratedLevels()
  }
})

watch(() => JSON.stringify(status.value?.operations || {}), (next, prev) => {
  if (!realtimeConnected.value || next === prev)
    return
  refreshBag()
})

function onLogScroll(event: Event) {
  const element = event.target as HTMLElement
  if (!element)
    return
  autoScroll.value = element.scrollHeight - element.scrollTop - element.clientHeight < 50
  logScrollStates.set(getLogScrollStateKey(), { top: element.scrollTop, atBottom: autoScroll.value })
  if (autoScroll.value)
    pendingLogCount.value = 0
}

async function clearLogs() {
  if (!currentAccountId.value)
    return
  if (!window.confirm('确认清空当前账号的页面运行记录？此操作不会删除磁盘诊断日志。'))
    return

  clearingLogs.value = true
  try {
    const { data } = await api.delete('/api/logs')
    if (data?.ok) {
      toastStore.success('日志已清空')
      await refresh(true)
    }
    else {
      toastStore.error(`清空失败: ${data?.error || '未知错误'}`)
    }
  }
  catch (error: any) {
    const message = error?.response?.data?.error || error?.message || '请求失败'
    toastStore.error(`清空失败: ${message}`)
  }
  finally {
    clearingLogs.value = false
  }
}

watch(filteredLogs, (next, previous) => {
  nextTick(() => {
    if (logContainer.value && autoScroll.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
      pendingLogCount.value = 0
    }
    else if (next.length > (previous?.length || 0)) {
      pendingLogCount.value += next.length - (previous?.length || 0)
    }
  })
}, { deep: true })

function scrollToBottom() {
  nextTick(() => {
    if (logContainer.value)
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    autoScroll.value = true
    pendingLogCount.value = 0
  })
}

onMounted(async () => {
  statusStore.setRealtimeLogsEnabled(true)
  syncRealtimeAccount()
  await refresh()
  await refreshIllustratedLevels()
  scrollToBottom()
})

// Auto refresh fallback every 10s (WS 断开或启用筛选时回退 HTTP)
useIntervalFn(refresh, 10000)
// Countdown timer (every 1s)
useIntervalFn(updateCountdowns, 1000)
</script>

<template>
  <div class="dashboard-container">
    <div class="game-home">
      <!-- 用户信息卡片 -->
      <div class="game-card user-card">
        <div class="user-info-row">
          <img :src="currentAccount?.avatar || '/default-avatar.png'" alt="用户头像" class="user-avatar-large">
          <div class="user-details">
            <div class="user-name-row">
              <span class="user-name">{{ displayName }}</span>
              <span class="user-level">Lv.{{ status?.status?.level || 0 }}</span>
            </div>
            <div class="exp-bar-row">
              <div class="exp-progress-bar">
                <div class="exp-progress-fill" :style="{ width: `${getExpPercent(status?.levelProgress)}%` }" />
              </div>
              <span class="exp-total">{{ status?.levelProgress?.current || 0 }} / {{ status?.levelProgress?.needed || 0 }}</span>
            </div>
            <div class="exp-meta">
              <span class="exp-rate">
                <span class="exp-bolt i-fas-bolt" />
                EXP 效率：{{ expRate }}
              </span>
              <span v-if="timeToLevel" class="level-up-time">
                <span class="i-carbon-arrow-up" />
                {{ timeToLevel }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 资源卡片网格（毛玻璃面板） -->
      <div class="glass-panel">
        <div class="resource-cards">
          <div
            v-for="res in resourceCards"
            :key="res.key"
            class="game-card resource-card"
            :class="`res-${res.key}`"
          >
            <div class="resource-head">
              <img :src="res.icon" :alt="res.label" class="resource-mini-icon">
              <span class="resource-label">{{ res.label }}</span>
              <span class="card-arrow i-carbon-chevron-right" />
            </div>
            <div class="resource-amount">
              {{ res.amount }}
            </div>
            <img :src="res.icon" :alt="res.label" class="resource-big-icon">
          </div>
        </div>
      </div>

      <!-- 农场状态卡片 -->
      <RouterLink to="/personal" class="game-card farm-status-card">
        <div class="farm-status-left">
          <div class="farm-status-header">
            <div class="status-indicator">
              <span class="status-dot" :class="status?.connection?.connected ? 'online' : 'offline'" />
              <span class="status-text">{{ status?.connection?.connected ? '在线' : '离线' }}</span>
            </div>
            <span class="farm-status-label">农场运行中</span>
          </div>
          <div class="farm-metrics">
            <div class="farm-metric">
              <span class="farm-metric-icon metric-farm">
                <span class="i-carbon-sprout" />
              </span>
              <div class="farm-metric-text">
                <span class="farm-metric-value" :title="nextFarmCheck">{{ nextFarmCheck }}</span>
                <span class="farm-metric-label">农场</span>
              </div>
            </div>
            <div class="farm-metric">
              <span class="farm-metric-icon metric-help">
                <span class="i-carbon-user-multiple" />
              </span>
              <div class="farm-metric-text">
                <span class="farm-metric-value" :title="nextHelpCheck">{{ nextHelpCheck }}</span>
                <span class="farm-metric-label">帮助</span>
              </div>
            </div>
            <div class="farm-metric">
              <span class="farm-metric-icon metric-steal">
                <span class="i-carbon-run" />
              </span>
              <div class="farm-metric-text">
                <span class="farm-metric-value" :title="nextStealCheck">{{ nextStealCheck }}</span>
                <span class="farm-metric-label">偷菜</span>
              </div>
            </div>
            <div class="farm-metric">
              <span class="farm-metric-icon metric-uptime">
                <span class="i-carbon-time" />
              </span>
              <div class="farm-metric-text">
                <span class="farm-metric-value">{{ formatDuration(localUptime) }}</span>
                <span class="farm-metric-label">已运行</span>
              </div>
            </div>
          </div>
        </div>
        <div class="farm-scene">
          <img src="/dashboard/farm-scene.png" alt="农场">
          <span class="farm-scene-arrow">
            <span class="i-carbon-chevron-right" />
          </span>
        </div>
      </RouterLink>

      <!-- 功能网格（毛玻璃面板） -->
      <div class="glass-panel">
        <div class="feature-grid">
          <RouterLink
            v-for="feature in featureCards"
            :key="feature.key"
            :to="feature.to"
            class="game-card feature-card"
            :class="`feat-${feature.key}`"
          >
            <img :src="feature.icon" :alt="feature.title" class="feature-icon">
            <div class="feature-info">
              <div class="feature-title">
                {{ feature.title }}
              </div>
              <div class="feature-subtitle">
                {{ feature.subtitle }}
              </div>
            </div>
            <span class="card-arrow i-carbon-chevron-right" />
          </RouterLink>
        </div>
      </div>

      <!-- 每日签到横幅 -->
      <div class="daily-checkin-banner">
        <img src="/dashboard/cow.png" alt="奶牛" class="banner-cow">
        <div class="banner-text">
          <h3>每日签到</h3>
          <p>领取丰厚奖励</p>
        </div>
        <RouterLink to="/activity" class="checkin-btn">
          立即前往
          <span class="i-carbon-chevron-right" />
        </RouterLink>
      </div>
    </div>

    <!-- 原有的统计和日志区域 -->
    <div class="legacy-section">
      <div class="grid grid-cols-1 shrink-0 gap-4 lg:grid-cols-3 sm:grid-cols-2">
        <div class="ui-card metric-card min-h-[168px] flex flex-col rounded-lg p-5">
          <div class="mb-2 flex items-start justify-between">
            <div class="flex items-center gap-1.5 text-sm text-gray-500">
              <div class="i-fas-user-circle" />
              账号
            </div>
            <div class="rounded-lg bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              Lv.{{ status?.status?.level || 0 }}
            </div>
          </div>
          <div class="mb-1 truncate text-xl font-bold" :title="displayName">
            {{ displayName }}
          </div>
          <div class="mt-auto">
            <div class="mb-1 flex justify-between text-xs text-gray-500">
              <div class="flex items-center gap-1">
                <div class="i-fas-bolt text-blue-400" />
                <span>EXP</span>
              </div>
              <span>{{ status?.levelProgress?.current || 0 }} / {{ status?.levelProgress?.needed || '?' }}</span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div
                class="h-full rounded-full bg-blue-500 transition-all duration-500"
                :style="{ width: `${getExpPercent(status?.levelProgress)}%` }"
              />
            </div>
            <div class="mt-2 flex justify-between text-xs text-gray-400">
              <span>效率: {{ expRate }}</span>
              <span>{{ timeToLevel }}</span>
            </div>
          </div>
        </div>

        <div class="ui-card metric-card min-h-[168px] flex flex-col justify-between rounded-lg p-5">
          <div class="grid grid-cols-4 gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 text-xs text-gray-500">
                <img src="/game-config/resource-icons/gold.png" alt="金币" class="h-5 w-5 shrink-0 object-contain">
                金币
              </div>
              <div class="text-2xl text-yellow-600 font-bold dark:text-yellow-500">
                {{ formatGoldAmount(status?.status?.gold || 0) }}
              </div>
              <div
                v-if="(status?.sessionGoldGained || 0) !== 0"
                class="text-[10px]"
                :class="(status?.sessionGoldGained || 0) > 0 ? 'text-green-500' : 'text-red-500'"
              >
                {{ (status?.sessionGoldGained || 0) > 0 ? '+' : '' }}{{ formatGoldAmount(status?.sessionGoldGained || 0) }}
              </div>
            </div>
            <div class="min-w-0 text-center">
              <div class="flex items-center justify-center gap-1.5 text-xs text-gray-500">
                <img src="/game-config/resource-icons/coupon.png" alt="点券" class="h-5 w-5 shrink-0 object-contain">
                点券
              </div>
              <div class="text-2xl text-emerald-500 font-bold dark:text-emerald-400">
                {{ formatCouponAmount(status?.status?.coupon || 0) }}
              </div>
              <div
                v-if="(status?.sessionCouponGained || 0) !== 0"
                class="text-[10px]"
                :class="(status?.sessionCouponGained || 0) > 0 ? 'text-green-500' : 'text-red-500'"
              >
                {{ (status?.sessionCouponGained || 0) > 0 ? '+' : '' }}{{ formatCouponAmount(status?.sessionCouponGained || 0) }}
              </div>
            </div>
            <div class="min-w-0 text-center">
              <div class="flex items-center justify-center gap-1.5 text-xs text-gray-500">
                <img src="/game-config/resource-icons/diamond.png" alt="钻石" class="h-5 w-5 shrink-0 object-contain">
                钻石
              </div>
              <div class="text-2xl text-cyan-600 font-bold dark:text-cyan-400">
                {{ formatCouponAmount(status?.status?.diamond || 0) }}
              </div>
            </div>
            <div class="min-w-0 text-right">
              <div class="flex items-center justify-end gap-1.5 text-xs text-gray-500">
                <img src="/game-config/resource-icons/gold-bean.png" alt="金豆豆" class="h-5 w-5 shrink-0 object-contain">
                金豆
              </div>
              <div class="text-2xl text-amber-500 font-bold dark:text-amber-400">
                {{ formatGoldBeanAmount(status?.status?.goldBean || 0) }}
              </div>
            </div>
          </div>
          <div class="mt-4 border-t border-gray-100/80 pt-3 dark:border-gray-700/80">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="h-2.5 w-2.5 rounded-full" :class="status?.connection?.connected ? 'bg-green-500' : currentStatusReady ? 'bg-red-500' : 'bg-gray-300'" />
                <span class="text-xs font-bold">{{ status?.connection?.connected ? '在线' : currentStatusReady ? '离线' : '检查中' }}</span>
              </div>
              <div class="flex items-center gap-1.5 text-xs text-gray-400">
                <div class="i-fas-clock text-purple-400" />
                {{ formatDuration(localUptime) }}
              </div>
            </div>
          </div>
        </div>

        <div class="ui-card metric-card min-h-[168px] flex flex-col justify-between rounded-lg p-5">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="flex items-center gap-1 text-xs text-gray-400">
                <img src="/game-config/resource-icons/fertilizer-normal.png" alt="普通化肥" class="h-5 w-5 shrink-0 object-contain">
                普通
              </div>
              <div class="font-bold">
                {{ formatBucketTime(fertilizerNormal) }}
              </div>
            </div>
            <div>
              <div class="flex items-center gap-1 text-xs text-gray-400">
                <img src="/game-config/resource-icons/fertilizer-organic.png" alt="有机化肥" class="h-5 w-5 shrink-0 object-contain">
                有机
              </div>
              <div class="font-bold">
                {{ formatBucketTime(fertilizerOrganic) }}
              </div>
            </div>
          </div>
          <div class="my-3 border-t border-gray-100/80 dark:border-gray-700/80" />
          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="flex items-center gap-1 text-xs text-gray-400">
                <img src="/game-config/resource-icons/illustrated-crop.png" alt="作物图鉴" class="h-6 w-6 shrink-0 object-contain">
                作物图鉴
              </div>
              <div class="font-bold">
                Lv.{{ illustratedLevels.crop }}
              </div>
            </div>
            <div>
              <div class="flex items-center gap-1 text-xs text-gray-400">
                <img src="/game-config/resource-icons/illustrated-mutant.png" alt="超变图鉴" class="h-6 w-6 shrink-0 object-contain">
                超变图鉴
              </div>
              <div class="font-bold">
                Lv.{{ illustratedLevels.mutant }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-1 flex-col items-stretch gap-5 md:min-h-0 md:flex-row">
        <div class="flex flex-1 flex-col gap-5 md:min-h-0 md:w-3/4">
          <div class="ui-card-elevated flex flex-1 flex-col rounded-lg p-3 md:min-h-0 md:overflow-hidden sm:p-5">
            <div class="mb-4 flex flex-col gap-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h3 class="flex items-center gap-2 text-lg font-medium">
                  <div class="i-carbon-document" />
                  <span>运行日志</span>
                  <span class="text-xs text-gray-400 font-normal">{{ visibleLogs.length }} 条</span>
                </h3>
              </div>

              <div class="flex flex-wrap items-center gap-2 text-sm">
                <BaseInput
                  v-model="filter.keyword"
                  placeholder="搜索日志内容"
                  class="min-w-48 flex-1 sm:max-w-72"
                  clearable
                  @keyup.enter="onLogSearchTrigger"
                  @clear="onLogSearchTrigger"
                />

                <BaseSelect
                  v-model="filter.module"
                  :options="modules"
                  class="w-36"
                  @change="onLogFilterChange"
                />

                <BaseSelect
                  v-model="filter.event"
                  :options="events"
                  class="w-36"
                  @change="onLogFilterChange"
                />

                <BaseButton
                  v-if="hasActiveLogFilter"
                  variant="ghost"
                  size="sm"
                  @click="Object.assign(filter, { module: '', event: '', keyword: '' }); onLogFilterChange()"
                >
                  <div class="i-carbon-filter-remove mr-1" />
                  重置
                </BaseButton>

                <BaseButton
                  variant="secondary"
                  size="sm"
                  :loading="refreshingLogs"
                  @click="refreshRuntimeLogs"
                >
                  <div class="i-carbon-renew mr-1" />
                  刷新
                </BaseButton>

                <BaseButton
                  variant="secondary"
                  size="sm"
                  :loading="clearingLogs"
                  @click="clearLogs"
                >
                  <div class="i-carbon-trash-can mr-1" />
                  清空
                </BaseButton>
              </div>
            </div>

            <div ref="logContainer" class="ui-subtle-panel relative max-h-[50vh] min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-lg p-1.5 text-sm md:max-h-none sm:p-2" @scroll="onLogScroll">
              <div v-if="!visibleLogs.length" class="py-8 text-center text-gray-400">
                <div class="i-carbon-document-blank mx-auto mb-3 text-3xl text-gray-300" />
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  {{ hasActiveLogFilter ? '没有符合条件的日志' : '暂无日志' }}
                </div>
                <div class="mt-1 text-xs text-gray-400">
                  {{ hasActiveLogFilter ? '可以调整或重置筛选条件。' : '运行账号后，这里会持续追加巡查、种植、任务和出售记录。' }}
                </div>
              </div>
              <div
                v-for="log in visibleLogs"
                :key="log.id"
                class="grid grid-cols-1 mb-0.5 gap-x-2 gap-y-1 border rounded-md px-2.5 py-1.5 transition-colors sm:grid-cols-[auto_1fr] sm:gap-y-0"
                :class="getLogRowClass(log)"
              >
                <span class="select-none whitespace-nowrap pt-0.5 text-xs text-gray-400 font-mono">{{ formatLogTimeRange(log) }}</span>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-start gap-1">
                    <span class="shrink-0 rounded px-1.5 py-0.5 text-xs font-bold" :class="getLogTagClass(log.tag)">{{ log.tag }}</span>
                    <span v-if="log.event && log.source !== 'account'" class="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-500 dark:bg-blue-900/20 dark:text-blue-400">{{ getEventLabel(log.event) }}</span>
                    <span class="min-w-0 break-words leading-5" :class="getLogMsgClass(log.tag)">{{ log.msg }}</span>
                    <span v-if="(log.repeatCount || 1) > 1" class="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600 font-medium dark:bg-gray-700 dark:text-gray-300">×{{ log.repeatCount }}</span>
                  </div>
                </div>
              </div>

              <button
                v-if="pendingLogCount"
                class="sticky bottom-2 left-1/2 z-10 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-white shadow-lg -translate-x-1/2"
                style="background: var(--theme-primary)"
                @click="scrollToBottom"
              >
                <div class="i-carbon-arrow-down" />
                {{ pendingLogCount }} 条新日志
              </button>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-4 md:min-h-0 md:w-1/4 md:overflow-hidden">
          <div class="ui-card flex shrink-0 flex-col rounded-lg p-3.5">
            <h3 class="mb-3 flex items-center gap-2 text-base font-medium 2xl:text-lg">
              <div class="i-carbon-hourglass" />
              <span>下次检查倒计时</span>
            </h3>
            <div class="grid grid-cols-3 gap-2">
              <div class="min-w-0 flex flex-col items-center text-center">
                <div
                  class="h-18 w-18 flex items-center justify-center rounded-full p-1"
                  :style="getCountdownRingStyle(localNextFarmRemainSec, farmCountdownTotal, '#22c55e')"
                >
                  <div class="h-full w-full flex flex-col items-center justify-center rounded-full bg-white dark:bg-gray-800">
                    <div class="i-carbon-sprout text-xl text-green-500" />
                    <span class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">农场</span>
                  </div>
                </div>
                <div class="mt-1.5 w-full truncate text-sm font-bold font-mono 2xl:text-base" :title="nextFarmCheck">
                  {{ nextFarmCheck }}
                </div>
              </div>
              <div class="min-w-0 flex flex-col items-center text-center">
                <div
                  class="h-18 w-18 flex items-center justify-center rounded-full p-1"
                  :style="getCountdownRingStyle(localNextHelpRemainSec, helpCountdownTotal, '#3b82f6')"
                >
                  <div class="h-full w-full flex flex-col items-center justify-center rounded-full bg-white dark:bg-gray-800">
                    <div class="i-carbon-user-multiple text-xl text-blue-500" />
                    <span class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">帮助</span>
                  </div>
                </div>
                <div class="mt-1.5 w-full truncate text-sm font-bold font-mono 2xl:text-base" :title="nextHelpCheck">
                  {{ nextHelpCheck }}
                </div>
              </div>
              <div class="min-w-0 flex flex-col items-center text-center">
                <div
                  class="h-18 w-18 flex items-center justify-center rounded-full p-1"
                  :style="getCountdownRingStyle(localNextStealRemainSec, stealCountdownTotal, '#f97316')"
                >
                  <div class="h-full w-full flex flex-col items-center justify-center rounded-full bg-white dark:bg-gray-800">
                    <div class="i-carbon-run text-xl text-orange-500" />
                    <span class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">偷菜</span>
                  </div>
                </div>
                <div class="mt-1.5 w-full truncate text-sm font-bold font-mono 2xl:text-base" :title="nextStealCheck">
                  {{ nextStealCheck }}
                </div>
              </div>
            </div>
          </div>

          <div class="ui-card min-h-0 flex flex-1 flex-col overflow-hidden rounded-lg p-4">
            <h3 class="mb-3 flex items-center gap-2 text-base font-medium 2xl:text-lg">
              <div class="i-carbon-chart-column" />
              <span>今日统计</span>
            </h3>
            <div v-if="currentAccountDisconnected" class="ui-subtle-panel flex flex-col items-center justify-center gap-3 rounded-lg p-5 text-center text-gray-500">
              <div class="i-carbon-connection-signal-off text-4xl text-gray-400" />
              <div class="flex flex-col">
                <div class="text-lg text-gray-700 font-medium dark:text-gray-300">
                  账号未登录
                </div>
                <div class="mt-1 text-sm text-gray-400">
                  请先运行账号或检查网络连接。
                </div>
              </div>
            </div>
            <div v-else-if="!Object.keys(filteredOperations).length" class="ui-subtle-panel flex flex-col items-center justify-center gap-2 rounded-lg p-5 text-center">
              <div class="i-carbon-chart-column text-3xl text-gray-300" />
              <div class="text-sm text-gray-600 font-medium dark:text-gray-300">
                暂无主动作统计
              </div>
              <div class="text-xs text-gray-400">
                通常是刚启动、刚切换账号，或本轮巡查尚未完成。
              </div>
            </div>
            <div v-else class="grid auto-rows-fr grid-cols-2 min-h-0 flex-1 gap-1.5 2xl:gap-2">
              <div
                v-for="(val, key) in filteredOperations"
                :key="key"
                class="ui-subtle-panel min-w-0 flex items-center justify-between rounded-lg px-2 py-1.5"
              >
                <div class="min-w-0 flex items-center gap-1.5">
                  <div class="text-base 2xl:text-lg" :class="[getOpIcon(key), getOpColor(key)]" />
                  <div class="truncate text-xs text-gray-500 2xl:text-sm" :title="getOpName(key)">
                    {{ getOpName(key) }}
                  </div>
                </div>
                <div class="text-sm font-bold 2xl:text-base">
                  {{ val }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-container {
  display: flex;
  width: 100%;
  min-height: 100%;
}

/* 游戏风格内容列 */
.game-home {
  display: flex;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  flex-direction: column;
  gap: 14px;
}

/* 果冻玻璃卡片基础样式：半透明毛玻璃，透出背景 */
.game-card {
  position: relative;
  border-radius: 20px;
  border: 1.5px solid rgba(255, 255, 255, 0.65);
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.58) 0%, rgba(255, 255, 255, 0.28) 100%);
  box-shadow:
    0 10px 28px rgba(31, 38, 80, 0.12),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(24px) saturate(1.35);
  -webkit-backdrop-filter: blur(24px) saturate(1.35);
}

/* 用户信息卡片 */
.user-card {
  padding: 18px 20px;
}

.user-info-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-avatar-large {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 6px 16px rgba(31, 38, 80, 0.18);
  flex-shrink: 0;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.user-name {
  font-size: 18px;
  font-weight: 700;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-level {
  background: linear-gradient(135deg, #34d399, #10b981);
  color: #fff;
  padding: 3px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.exp-bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.exp-progress-bar {
  flex: 1;
  height: 12px;
  border-radius: 999px;
  background: rgba(31, 38, 80, 0.08);
  overflow: hidden;
  box-shadow: inset 0 1px 3px rgba(31, 38, 80, 0.08);
}

.exp-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #4ade80, #22c55e);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
  transition: width 0.5s ease;
}

.exp-total {
  font-size: 13px;
  font-weight: 600;
  color: #4b5563;
  white-space: nowrap;
}

.exp-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: #6b7280;
}

.exp-rate {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 500;
}

.exp-bolt {
  color: #3b82f6;
}

.level-up-time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #16a34a;
  font-weight: 600;
  white-space: nowrap;
}

/* 资源卡片网格 */
.resource-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.resource-card {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 96px;
  overflow: hidden;
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease;
}

.resource-card:hover {
  transform: translateY(-3px);
  box-shadow:
    0 14px 32px rgba(31, 38, 80, 0.16),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.95);
}

/* 各资源的柔和底色（半透明玻璃着色） */
.res-gold {
  background: linear-gradient(165deg, rgba(255, 224, 145, 0.6) 0%, rgba(255, 248, 228, 0.24) 100%);
}

.res-coupon {
  background: linear-gradient(165deg, rgba(178, 240, 205, 0.6) 0%, rgba(240, 252, 244, 0.24) 100%);
}

.res-diamond {
  background: linear-gradient(165deg, rgba(183, 222, 252, 0.6) 0%, rgba(238, 248, 255, 0.24) 100%);
}

.res-bean {
  background: linear-gradient(165deg, rgba(255, 216, 160, 0.6) 0%, rgba(255, 246, 232, 0.24) 100%);
}

.res-fert-normal {
  background: linear-gradient(165deg, rgba(222, 196, 166, 0.6) 0%, rgba(250, 244, 235, 0.24) 100%);
}

.res-fert-organic {
  background: linear-gradient(165deg, rgba(198, 240, 156, 0.6) 0%, rgba(244, 252, 236, 0.24) 100%);
}

.res-crop {
  background: linear-gradient(165deg, rgba(255, 199, 220, 0.6) 0%, rgba(255, 243, 248, 0.24) 100%);
}

.res-mutant {
  background: linear-gradient(165deg, rgba(216, 192, 252, 0.6) 0%, rgba(246, 241, 255, 0.24) 100%);
}

/* 资源数值：按资源着色并放大 */
.res-gold .resource-amount {
  color: #d97706;
}

.res-coupon .resource-amount {
  color: #059669;
}

.res-diamond .resource-amount {
  color: #0284c7;
}

.res-bean .resource-amount {
  color: #c2620a;
}

.res-fert-normal .resource-amount {
  color: #92610f;
}

.res-fert-organic .resource-amount {
  color: #55800a;
}

.res-crop .resource-amount {
  color: #d6336c;
}

.res-mutant .resource-amount {
  color: #7048e8;
}

.resource-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.resource-mini-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.resource-label {
  font-size: 13px;
  font-weight: 600;
  color: #4b5563;
  white-space: nowrap;
  overflow: hidden;
}

.resource-amount {
  font-size: 22px;
  font-weight: 800;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.resource-big-icon {
  position: absolute;
  right: 6px;
  bottom: 2px;
  width: 52px;
  height: 52px;
  object-fit: contain;
  filter: drop-shadow(0 4px 8px rgba(31, 38, 80, 0.2));
  pointer-events: none;
}

.card-arrow {
  margin-left: auto;
  font-size: 14px;
  color: rgba(55, 65, 81, 0.35);
  flex-shrink: 0;
}

/* 农场状态卡片 */
.farm-status-card {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  min-height: 148px;
  overflow: hidden;
  text-decoration: none;
  cursor: pointer;
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease;
}

.farm-status-card:hover {
  transform: translateY(-3px);
  box-shadow:
    0 14px 32px rgba(31, 38, 80, 0.16),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.95);
}

.farm-status-left {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
}

.farm-status-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 7px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-dot.online {
  background: #22c55e;
  box-shadow: 0 0 10px rgba(34, 197, 94, 0.6);
}

.status-dot.offline {
  background: #ef4444;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.6);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.status-text {
  color: #374151;
  font-weight: 700;
  font-size: 15px;
}

.farm-status-label {
  color: #16a34a;
  border: 1.5px solid rgba(34, 197, 94, 0.55);
  background: rgba(34, 197, 94, 0.08);
  border-radius: 999px;
  padding: 2px 12px;
  font-size: 12px;
  font-weight: 600;
}

/* 三个检查倒计时 + 已运行：两行两列，均限制在左侧区域，不遮挡右侧插画 */
.farm-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
}

.farm-metric {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.farm-metric-icon {
  display: flex;
  height: 30px;
  width: 30px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  font-size: 15px;
}

.farm-metric-icon.metric-farm {
  background: linear-gradient(135deg, #4ade80, #22c55e);
  box-shadow: 0 4px 10px rgba(34, 197, 94, 0.35);
}

.farm-metric-icon.metric-help {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  box-shadow: 0 4px 10px rgba(59, 130, 246, 0.35);
}

.farm-metric-icon.metric-steal {
  background: linear-gradient(135deg, #fb923c, #f97316);
  box-shadow: 0 4px 10px rgba(249, 115, 22, 0.35);
}

.farm-metric-icon.metric-uptime {
  background: linear-gradient(135deg, #34d399, #10b981);
  box-shadow: 0 4px 10px rgba(16, 185, 129, 0.35);
}

.farm-metric-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  line-height: 1.25;
}

.farm-metric-value {
  font-size: 14px;
  font-weight: 700;
  font-family: 'DM Mono', 'Courier New', monospace;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.farm-metric-label {
  color: #6b7280;
  font-size: 11px;
}

/* 农场插画：左侧渐隐融入毛玻璃卡片，贴齐卡片右缘，避免“贴图”感 */
.farm-scene {
  position: relative;
  display: flex;
  width: 46%;
  max-width: 320px;
  flex-shrink: 0;
  margin: -16px -18px -16px 0;
  border-radius: 0 18px 18px 0;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 34%);
  mask-image: linear-gradient(90deg, transparent 0%, #000 34%);
}

.farm-scene img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.92;
}

.farm-scene-arrow {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  display: flex;
  height: 26px;
  width: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.75);
  color: #4b5563;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(31, 38, 80, 0.18);
}

/* 功能网格 */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

/* 毛玻璃分组面板：整组功能卡片的透明衬底 */
.glass-panel {
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.32);
  box-shadow: 0 10px 30px rgba(31, 38, 80, 0.1);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  padding: 12px;
}

/* 功能卡片各自的柔和渐变底色（半透明玻璃着色） */
.feat-crop {
  background: linear-gradient(165deg, rgba(196, 242, 214, 0.6) 0%, rgba(245, 253, 247, 0.26) 100%);
}

.feat-pet {
  background: linear-gradient(165deg, rgba(255, 228, 196, 0.6) 0%, rgba(255, 250, 240, 0.26) 100%);
}

.feat-book {
  background: linear-gradient(165deg, rgba(200, 226, 252, 0.6) 0%, rgba(243, 249, 255, 0.26) 100%);
}

.feat-shop {
  background: linear-gradient(165deg, rgba(255, 214, 168, 0.6) 0%, rgba(255, 247, 235, 0.26) 100%);
}

.feat-gift {
  background: linear-gradient(165deg, rgba(250, 210, 232, 0.6) 0%, rgba(253, 245, 250, 0.26) 100%);
}

.feat-chart {
  background: linear-gradient(165deg, rgba(193, 240, 235, 0.6) 0%, rgba(242, 252, 251, 0.26) 100%);
}

.feature-card {
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  text-decoration: none;
  cursor: pointer;
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease;
}

.feature-card:hover {
  transform: translateY(-3px);
  box-shadow:
    0 14px 32px rgba(31, 38, 80, 0.16),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.95);
}

.feature-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  object-fit: cover;
  flex-shrink: 0;
  filter: drop-shadow(0 3px 6px rgba(31, 38, 80, 0.15));
}

.feature-info {
  flex: 1;
  min-width: 0;
}

.feature-title {
  font-size: 14px;
  font-weight: 700;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.feature-subtitle {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 每日签到横幅 */
.daily-checkin-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 20px;
  padding: 12px 16px 12px 0;
  min-height: 88px;
  background:
    linear-gradient(180deg, rgba(186, 226, 248, 0.35) 0%, rgba(255, 255, 255, 0.08) 45%, rgba(134, 214, 152, 0.4) 100%),
    linear-gradient(165deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.26) 100%);
  border: 1.5px solid rgba(255, 255, 255, 0.65);
  box-shadow:
    0 10px 28px rgba(31, 38, 80, 0.12),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(24px) saturate(1.35);
  -webkit-backdrop-filter: blur(24px) saturate(1.35);
  overflow: hidden;
}

.banner-cow {
  height: 100%;
  width: 108px;
  object-fit: cover;
  object-position: center;
  flex-shrink: 0;
  border-radius: 14px 0 0 14px;
  margin: -12px 0 -12px -16px;
  margin-left: -1.5px;
}

.banner-text {
  flex: 1;
  min-width: 0;
}

.banner-text h3 {
  font-size: 19px;
  font-weight: 800;
  color: #166534;
  margin: 0;
  letter-spacing: 1px;
}

.banner-text p {
  font-size: 12px;
  color: #4d7c5f;
  margin: 3px 0 0;
}

.checkin-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  border-radius: 999px;
  padding: 9px 18px;
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  box-shadow:
    0 5px 14px rgba(16, 185, 129, 0.45),
    inset 0 0 0 2px rgba(255, 255, 255, 0.55);
  transition: all 0.2s ease;
}

.checkin-btn:hover {
  transform: translateY(-2px);
  box-shadow:
    0 8px 18px rgba(16, 185, 129, 0.5),
    inset 0 0 0 2px rgba(255, 255, 255, 0.55);
}

/* 原有区域 */
.legacy-section {
  display: none;
}

/* 响应式设计 */
@media (max-width: 640px) {
  .resource-cards {
    gap: 8px;
  }

  .resource-card {
    padding: 10px;
    min-height: 84px;
  }

  .resource-amount {
    font-size: 16px;
  }

  .resource-big-icon {
    width: 42px;
    height: 42px;
  }

  .user-card {
    padding: 14px 16px;
  }

  .user-avatar-large {
    width: 54px;
    height: 54px;
  }

  .user-name {
    font-size: 16px;
  }

  .farm-time {
    font-size: 23px;
  }

  .farm-scene {
    width: 40%;
  }

  .banner-cow {
    width: 88px;
  }

  .checkin-btn {
    padding: 8px 14px;
    font-size: 13px;
  }
}

@media (max-width: 560px) {
  .glass-panel {
    padding: 8px;
  }

  /* 窄屏功能卡改两列，避免标题截断 */
  .feature-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
}

@media (max-width: 480px) {
  .resource-cards {
    gap: 6px;
  }

  .resource-card {
    padding: 8px;
    min-height: 74px;
    border-radius: 16px;
  }

  .resource-label {
    font-size: 11px;
  }

  .resource-amount {
    font-size: 13px;
  }

  .resource-mini-icon {
    width: 15px;
    height: 15px;
  }

  .resource-big-icon {
    right: 2px;
    bottom: 0;
    width: 34px;
    height: 34px;
  }

  .card-arrow {
    font-size: 11px;
  }

  .feature-grid {
    gap: 6px;
  }

  .feature-card {
    padding: 10px;
    border-radius: 16px;
  }

  .feature-icon {
    width: 36px;
    height: 36px;
    border-radius: 11px;
  }

  .feature-title {
    font-size: 12px;
  }

  .feature-subtitle {
    font-size: 10px;
  }

  .game-card {
    border-radius: 16px;
  }

  .daily-checkin-banner {
    min-height: 68px;
    border-radius: 16px;
  }

  .banner-cow {
    width: 72px;
  }

  .banner-text h3 {
    font-size: 15px;
  }

  .banner-text p {
    font-size: 10px;
  }
}
</style>
