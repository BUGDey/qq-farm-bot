<script setup lang="ts">
import type { RuntimeLogEntry } from '@/utils/runtime-log'
import { useEventListener, useIntervalFn } from '@vueuse/core'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRanchResource } from '@/composables/useRanchResource'
import { useRanchSync } from '@/composables/useRanchSync'
import { useAccountStore } from '@/stores/account'
import { useStatusStore } from '@/stores/status'
import { DASHBOARD_EMPTY, formatCouponAmount, formatDashboardValue } from '@/utils/number-format'
import { readRanchDashboardCache, writeRanchDashboardCache } from '@/utils/ranch-dashboard-cache'
import type { RanchDashboardCacheEntry } from '@/utils/ranch-dashboard-cache'
import { ranchActionLabels } from '@/utils/ranch-display'
import { createRanchExpSampler, RANCH_EXP_MAX_GAP_MS, ranchExpForecast, readRanchExp } from '@/utils/ranch-exp'
import { compactRuntimeLogs, matchesRuntimeLog, normalizeRuntimeLog } from '@/utils/runtime-log'

const ranch = useRanchSync()
const account = useAccountStore()
const status = useStatusStore()
const profile = useRanchResource(ref('profile'))
const illustrated = useRanchResource(ref('illustrated'))
const clock = ref(Date.now())
useIntervalFn(() => { clock.value = Date.now() }, 1000)

// Account status is shared connection metadata; ranch XP and inventory always come from ranch reads.
const connection = computed(() => status.currentStatusReady ? status.status?.connection : null)
const currentAccountDisconnected = computed(() => !!connection.value && !connection.value.connected)
const connectionLabel = computed(() => connection.value ? connection.value.connected ? '在线' : '离线' : '未知')
// 冷启动缓存：上次成功读到的展示数据先顶上，真实请求回来后再替换（见 utils/ranch-dashboard-cache）。
const cacheEntry = ref<RanchDashboardCacheEntry | null>(null)
function loadDashboardCache() {
  const accountId = account.currentAccountId
  cacheEntry.value = accountId ? readRanchDashboardCache(accountId) : null
}
loadDashboardCache()
watch(() => account.currentAccountId, loadDashboardCache, { flush: 'sync' })
const liveProfileData = computed(() => profile.error.value ? null : profile.data.value)
const profileData = computed(() => liveProfileData.value ?? cacheEntry.value?.profile ?? null)
// 头像加载失败时回退到确实存在的默认图，避免出现空白圆圈。
const DEFAULT_AVATAR = '/admin-default-avatar.jpg'
const avatarSrc = computed(() => profileData.value?.avatar || account.currentAccount?.avatar || DEFAULT_AVATAR)
function onAvatarError(event: Event) {
  const img = event.target as HTMLImageElement
  if (img && img.src && !img.src.endsWith(DEFAULT_AVATAR))
    img.src = DEFAULT_AVATAR
}
const illustratedData = computed(() => (illustrated.error.value ? null : illustrated.data.value) ?? cacheEntry.value?.illustrated ?? null)
const liveSnapshot = computed(() => ranch.error ? null : ranch.data)
const liveInventory = computed(() => !liveSnapshot.value?.sectionErrors?.warehouse && Array.isArray(liveSnapshot.value?.items) ? liveSnapshot.value : null)
const snapshot = computed(() => liveSnapshot.value ?? cacheEntry.value?.snapshot ?? null)
const inventory = computed(() => liveInventory.value ?? cacheEntry.value?.snapshot ?? null)
// 正在用缓存顶替（真实请求尚未返回或失败）时给出明确提示，不把旧数据当实时数据。
const usingCachedData = computed(() => !!(
  (!liveInventory.value && cacheEntry.value?.snapshot)
  || (!liveProfileData.value && cacheEntry.value?.profile)
  || ((illustrated.error.value || !illustrated.data.value) && cacheEntry.value?.illustrated)
))
const cacheAgeText = computed(() => {
  const savedAt = Number(cacheEntry.value?.savedAt)
  if (!Number.isFinite(savedAt) || savedAt <= 0)
    return ''
  const minutes = Math.max(0, Math.floor((clock.value - savedAt) / 60000))
  if (minutes < 1)
    return '缓存于刚刚'
  if (minutes < 60)
    return `缓存于 ${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `缓存于 ${hours} 小时前` : `缓存于 ${Math.floor(hours / 24)} 天前`
})
function persistDashboardCache() {
  const accountId = account.currentAccountId
  if (!accountId || document.hidden)
    return
  const profileSlice = liveProfileData.value
  const illustratedSlice = illustrated.error.value ? null : illustrated.data.value
  const snapshotSlice = liveInventory.value
  // 空/失败读取不写缓存，避免用 0 覆盖掉之前可用的数据。
  if (!profileSlice && !illustratedSlice && !snapshotSlice)
    return
  // 三个请求各自独立返回：写入时保留本次没有返回的旧分片，别把它们的缓存抹掉。
  const existing = readRanchDashboardCache(accountId)
  if (writeRanchDashboardCache(accountId, {
    profile: profileSlice ?? existing?.profile,
    illustrated: illustratedSlice ?? existing?.illustrated,
    snapshot: snapshotSlice ?? existing?.snapshot,
  }))
    loadDashboardCache()
}
let cacheWriteScheduled = false
function scheduleDashboardCacheWrite() {
  if (cacheWriteScheduled)
    return
  cacheWriteScheduled = true
  window.setTimeout(() => {
    cacheWriteScheduled = false
    persistDashboardCache()
  }, 1000)
}
watch([() => profile.data.value, () => illustrated.data.value, () => ranch.data], scheduleDashboardCacheWrite)
const displayName = computed(() => {
  const name = profileData.value?.name || account.currentAccount?.nick
  return name ? `${name}${account.currentAccount?.name ? ` (${account.currentAccount.name})` : ''}` : account.currentAccount?.name || '未知'
})
const expSampler = createRanchExpSampler()
const expObservation = ref<{ gain: number | null, seconds: number | null, at: number } | null>(null)
function resetExpObservation() {
  expSampler.reset()
  expObservation.value = null
}
watch(() => account.currentAccountId, resetExpObservation, { flush: 'sync' })
watch(() => status.currentStatusReady ? status.status?.sessionUptime : null, (next, previous) => {
  if (typeof next === 'number' && typeof previous === 'number' && next < previous)
    resetExpObservation()
})
watch(currentAccountDisconnected, (disconnected) => {
  if (disconnected)
    resetExpObservation()
})
useEventListener(document, 'visibilitychange', resetExpObservation)
watch(profile.error, (error) => {
  if (error)
    resetExpObservation()
})
watch(profile.data, (data) => {
  if (document.hidden || profile.error.value || currentAccountDisconnected.value) {
    resetExpObservation()
    return
  }
  const at = Date.now()
  const observed = expSampler.sample({
    accountId: account.currentAccountId,
    exp: data?.exp,
    at,
    sessionUptime: status.currentStatusReady ? status.status?.sessionUptime : null,
  })
  expObservation.value = observed ? { ...observed, at } : null
})
const expForecast = computed(() => {
  const observation = expObservation.value
  const fresh = observation && clock.value - observation.at <= RANCH_EXP_MAX_GAP_MS
  // 效率必须来自本次会话的真实读数；缓存数据只用于展示等级/进度，不参与采样。
  const data = liveProfileData.value
  const available = !!data && readRanchExp(data.exp) !== null && !currentAccountDisconnected.value
  const forecast = ranchExpForecast(profileData.value?.levelProgress, available && fresh ? observation.gain : null, available && fresh ? observation.seconds : null)
  return {
    eta: forecast.eta === '暂无法估算' ? DASHBOARD_EMPTY : forecast.eta,
    rate: available && (!fresh || observation.gain === null) ? '采样中' : ['未知', '0/小时'].includes(forecast.rate) ? DASHBOARD_EMPTY : forecast.rate,
    remaining: forecast.remaining === '剩余经验未知' ? DASHBOARD_EMPTY : forecast.remaining,
  }
})
const expPercent = computed(() => {
  const progress = profileData.value?.levelProgress
  return progress?.needed > 0 ? Math.max(0, Math.min(100, Number(progress.current) / Number(progress.needed) * 100)) : 0
})
const expText = computed(() => {
  const data = profileData.value
  const progress = data?.levelProgress
  const current = formatDashboardValue(progress?.needed > 0 ? progress.current : data?.exp)
  const needed = formatDashboardValue(progress?.needed)
  return current === DASHBOARD_EMPTY && needed === DASHBOARD_EMPTY ? DASHBOARD_EMPTY : `${current} / ${needed}`
})
function itemCount(id: number): string | null {
  if (!Array.isArray(inventory.value?.items) || inventory.value?.sectionErrors?.warehouse)
    return null
  try {
    const items = inventory.value.items.filter((item: any) => Number(item.id) === id)
    // Shared premium currencies may be omitted by the scene-2 bag; omission is not a zero balance.
    if ((id === 1002 || id === 1004) && !items.length)
      return null
    return items.reduce((sum: bigint, item: any) => sum + BigInt(item.count), 0n).toString()
  }
  catch { return null }
}
function itemAmount(id: number) {
  // 钻石：实时权威余额优先；读不到时用农场状态下写入的缓存值（diamondCached），
  // 两者都缺失才显示占位符，查到 0 就显示 0。
  if (id === 1004) {
    // status store 的 status 是 worker 上报的 stats，钻石在嵌套的 stats.status 里
    // （与农场 Dashboard.vue 的 status.value?.status?.diamond 同一层级）。
    const snapshotStatus = status.status?.status || {}
    const live = snapshotStatus.diamond
    const cached = snapshotStatus.diamondCached
    const value = live ?? cached
    return formatDashboardValue(value, formatCouponAmount)
  }
  return formatDashboardValue(itemCount(id), formatCouponAmount)
}
function canTime(id: number) {
  const value = itemCount(id)
  return formatDashboardValue(value, seconds => `${(seconds / 3600).toFixed(1)}h`)
}
const resourceCards = computed(() => [
  { key: 'gold', label: '金券', icon: '/game-config/seed_images_named/seed_images/1007.png', amount: itemAmount(1007) },
  { key: 'bean', label: '松果', icon: '/game-config/seed_images_named/seed_images/1008.png', amount: itemAmount(1008) },
  { key: 'coupon', label: '点券', icon: '/game-config/resource-icons/coupon.png', amount: itemAmount(1002) },
  { key: 'diamond', label: '钻石', icon: '/game-config/resource-icons/diamond.png', amount: itemAmount(1004) },
  { key: 'can-normal', label: '普通罐头', icon: '/game-config/ranch-icons/can-normal.png', amount: canTime(7003) },
  { key: 'can-organic', label: '有机罐头', icon: '/game-config/ranch-icons/can-organic.png', amount: canTime(7004) },
  { key: 'grass', label: '牧草', icon: '/game-config/seed_images_named/seed_images/7001.png', amount: itemAmount(7001) },
  { key: 'poop', label: '便便', icon: '/game-config/ranch-icons/poop.png', amount: itemAmount(7002) },
  { key: 'crop', label: '普通图鉴', icon: '/game-config/resource-icons/illustrated-crop.png', amount: formatDashboardValue(illustratedData.value?.currentLevel, level => `Lv.${level}`) },
  { key: 'mutant', label: '巨大图鉴', icon: '/game-config/resource-icons/illustrated-mutant.png', amount: formatDashboardValue(illustratedData.value?.weightScore?.currentId, level => `Lv.${level}`) },
])
// 巡查项文案：running→巡查中；enabled+nextAt→剩余倒计时（到点显示即将巡查，绝对时刻放悬浮提示）；
// 未启用/未下发时间→等待巡查。nextAt 兼容秒/毫秒（小于 1e12 视为秒）。
function nextCheckState(queue: any): { value: string, hint: string } {
  if (!queue)
    return { value: '等待巡查', hint: '等待下发巡查时间' }
  if (queue.running)
    return { value: '巡查中', hint: '正在巡查' }
  if (!queue.enabled)
    return { value: '等待巡查', hint: '巡查未启用' }
  const raw = Number(queue?.nextAt)
  const nextAt = Number.isFinite(raw) && raw > 0 ? (raw < 1e12 ? raw * 1000 : raw) : 0
  if (!nextAt)
    return { value: '等待巡查', hint: '未下发巡查时间' }
  const date = new Date(nextAt)
  if (Number.isNaN(date.getTime()))
    return { value: '等待巡查', hint: '巡查时间无效' }
  const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  const remain = Math.max(0, Math.ceil((nextAt - clock.value) / 1000))
  const countdown = remain > 0 ? `${pad(remain / 3600)}:${pad(remain % 3600 / 60)}:${pad(remain % 60)} 后` : '即将巡查'
  return { value: countdown, hint: `巡查时刻 ${time}` }
}
const checks = computed(() => [
  { key: 'farm', label: '牧场巡查', icon: 'i-fas-paw' },
  { key: 'help', label: '帮助', icon: 'i-carbon-user-multiple' },
  { key: 'steal', label: '偷取', icon: 'i-carbon-run' },
].map((item) => {
  const queue = (status.currentStatusReady ? status.status?.ranchNextChecks?.[item.key] : null) ?? snapshot.value?.nextChecks?.[item.key]
  const state = nextCheckState(queue)
  const value = currentAccountDisconnected.value ? '账号未登录' : state.value
  return { ...item, value, hint: currentAccountDisconnected.value ? '账号未登录' : state.hint }
}))
const uptime = computed(() => formatDashboardValue(status.currentStatusReady ? status.status?.uptime : null, formatDuration))
const runLabel = computed(() => currentAccountDisconnected.value ? '牧场未运行' : !connection.value ? '牧场状态未知' : checks.value.some(check => check.value === '巡查中') ? '牧场巡查中' : '牧场状态')
const featureCards = [
  { key: 'crop', title: '图鉴', subtitle: '普通 / 巨大', icon: '/game-config/resource-icons/illustrated-crop.png', to: '/ranch/illustrated' },
  { key: 'pet', title: '个人', subtitle: '仓库 / 设施', icon: '/dashboard/icon-pet.png', to: '/ranch/personal' },
  { key: 'rank', title: '排行榜', subtitle: '本站排行', icon: '/dashboard/icon-ranking.svg', to: '/ranking' },
  { key: 'shop', title: '商城', subtitle: '牧场商品', icon: '/dashboard/icon-shop.png', to: '/ranch/shop' },
  { key: 'gift', title: '活动', subtitle: '精彩活动', icon: '/dashboard/icon-gift.png', to: '/activity' },
  { key: 'chart', title: '分析', subtitle: '牧场数据', icon: '/dashboard/icon-chart.png', to: '/ranch/analytics' },
]
const operationIcons: Record<string, string> = {
  collect: 'i-carbon-shopping-bag', harvest: 'i-carbon-crop-growth', clean: 'i-carbon-clean', place: 'i-fas-paw', produce: 'i-carbon-play', addFeed: 'i-carbon-sprout', submitOrder: 'i-carbon-task-complete', refreshOrder: 'i-carbon-renew', claimIllustrated: 'i-carbon-gift', claimWeight: 'i-carbon-trophy', steal: 'i-carbon-run', help: 'i-carbon-user-multiple', stroke: 'i-carbon-favorite', sell: 'i-carbon-shopping-cart', buy: 'i-carbon-shopping-cart', useCan: 'i-carbon-chemistry',
}
function getOpIcon(key: string) {
  return operationIcons[key] || 'i-carbon-chart-column'
}
// 今日统计图标颜色：基于 key 哈希稳定取一组高饱和预设色，保证每次渲染颜色一致、各项颜色不同。
const OP_COLORS = [
  'text-green-500', 'text-blue-400', 'text-yellow-500', 'text-red-400', 'text-teal-500',
  'text-emerald-500', 'text-lime-500', 'text-orange-500', 'text-amber-500', 'text-indigo-500',
  'text-pink-500', 'text-rose-500', 'text-purple-500', 'text-cyan-500', 'text-sky-500',
]
function getOpColor(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i++)
    hash += key.charCodeAt(i)
  return OP_COLORS[hash % OP_COLORS.length] || 'text-gray-400'
}
// 与农场 stats 逻辑一致：改用全期累计 operationsTotal（跨天/重启永久保留），
// 常驻展示全部统计项（没有数据显示 0），顺序按 ranchActionLabels 定义。
const operationStatItems = computed(() => {
  // Worker pushes statistics independently of the slow scene/inventory snapshot.
  const live = status.currentStatusReady ? status.status?.ranchStats : null
  const totals = (live?.operationsTotal ?? snapshot.value?.operationsTotal ?? {}) as Record<string, number>
  return Object.keys(ranchActionLabels).map(key => ({
    key,
    value: Number(totals[key]) || 0,
  }))
})
function formatDuration(seconds: number) {
  if (!Number.isFinite(Number(seconds)) || seconds < 0)
    return '未知'
  const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')
  return `${pad(seconds / 3600)}:${pad(seconds % 3600 / 60)}:${pad(seconds % 60)}`
}

// Mirror the farm home log presentation, with read-only controls and the existing account-scoped log store.
const homeLogContainer = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const logFilter = reactive({ module: '', event: '', level: '', keyword: '' })
const allLogs = computed(() => {
  if (!account.currentAccountId || !status.currentStatusReady)
    return []
  const entries = [...(status.logs || []).map((log: any) => normalizeRuntimeLog(log)), ...(status.accountLogs || []).map((log: any) => normalizeRuntimeLog(log, true))]
  return [...new Map(entries.map(log => [log.id, log])).values()].sort((a, b) => a.ts - b.ts)
})
const homeLogs = computed(() => compactRuntimeLogs(allLogs.value.filter(log => matchesRuntimeLog(log, logFilter))))
const logEvents = computed(() => [...new Set(allLogs.value.map(log => log.event).filter(Boolean))].sort())
const logModules = computed(() => [...new Set(allLogs.value.map(log => log.module).filter(Boolean))].sort())
const hasLogFilter = computed(() => !!(logFilter.module || logFilter.event || logFilter.level || logFilter.keyword))
function scrollToLatest() {
  if (homeLogContainer.value)
    homeLogContainer.value.scrollTop = homeLogContainer.value.scrollHeight
  autoScroll.value = true
}
function onLogScroll() {
  const element = homeLogContainer.value
  if (element)
    autoScroll.value = element.scrollHeight - element.scrollTop - element.clientHeight < 40
}
function logTime(log: RuntimeLogEntry) {
  const start = log.time.split(' ').pop() || ''
  return log.lastTs && log.lastTs !== log.ts ? `${start}–${new Date(log.lastTs).toLocaleTimeString('zh-CN', { hour12: false })}` : start
}
const syncingLogs = new Set<string>()
async function syncLogs() {
  const accountId = account.currentAccountId
  if (!accountId || document.hidden || syncingLogs.has(accountId))
    return
  syncingLogs.add(accountId)
  try {
    await Promise.all([status.fetchLogs(accountId, { limit: 300 }), status.fetchAccountLogs(accountId, 300)])
  }
  finally { syncingLogs.delete(accountId) }
}
watch(homeLogs, () => {
  if (autoScroll.value)
    void nextTick(scrollToLatest)
})
// 农场余额（钻石/点券）只在账号状态快照里，牧场页要自己拉一次，否则实时连接缺失时会一直显示未知。
const syncingStatus = new Set<string>()
async function syncStatus() {
  const accountId = account.currentAccountId
  if (!accountId || document.hidden || syncingStatus.has(accountId))
    return
  syncingStatus.add(accountId)
  try {
    await status.fetchStatus(accountId)
  }
  finally { syncingStatus.delete(accountId) }
}
watch(() => account.currentAccountId, () => {
  Object.assign(logFilter, { module: '', event: '', level: '', keyword: '' })
  autoScroll.value = true
  void syncLogs()
  void syncStatus()
}, { immediate: true })
useIntervalFn(() => {
  if (!status.realtimeConnected)
    void syncStatus()
}, 15000)
useIntervalFn(() => {
  if (!status.realtimeConnected)
    void syncLogs()
}, 10000)
</script>

<template>
  <div class="dashboard-container">
    <div v-if="!account.currentAccountId" class="game-card empty-state">请先选择账号</div>
    <div v-else class="game-home">
      <p v-if="ranch.error || profile.error.value || illustrated.error.value" class="game-card data-warning" role="alert">
        {{ ranch.error || profile.error.value || illustrated.error.value }}
      </p>
      <p v-if="usingCachedData" class="game-card cache-hint" role="status">
        <span class="i-carbon-time" /> 正在显示上次读取的缓存数据（{{ cacheAgeText }}），已自动在后台刷新。
      </p>
      <div class="game-card user-card">
        <div class="user-info-row">
          <img :src="avatarSrc" alt="用户头像" class="user-avatar-large" @error="onAvatarError">
          <div class="user-details">
            <div class="user-name-row">
              <span class="user-name" :title="displayName">{{ displayName }}</span>
              <span class="user-level">{{ formatDashboardValue(profileData?.level, level => `Lv.${level}`) }}</span>
            </div>
            <div class="exp-bar-row">
              <div class="exp-progress-bar" role="progressbar" aria-label="牧场经验" :aria-valuenow="profileData?.levelProgress ? expPercent : undefined" :aria-valuemin="0" :aria-valuemax="100">
                <div class="exp-progress-fill" :style="{ width: `${expPercent}%` }" />
              </div>
              <span class="exp-total">{{ expText }}</span>
            </div>
            <div class="exp-meta" title="本页连续有效牧场经验样本的平均效率；刷新、切号、会话重启或页面隐藏后重新采样，预估仅供参考">
              <span class="exp-rate"><span class="exp-bolt i-fas-bolt" />EXP 效率：{{ expForecast.rate }}<span class="exp-observation-label">（本页观测）</span></span>
              <span class="level-up-time"><span class="level-eta">{{ expForecast.eta }}</span><span class="level-need">{{ expForecast.remaining }}</span></span>
            </div>
          </div>
        </div>
      </div>

      <div class="glass-panel">
        <div class="resource-cards">
          <div v-for="res in resourceCards" :key="res.key" class="game-card resource-card" :class="`res-${res.key}`">
            <div class="resource-head"><img :src="res.icon" :alt="res.label" class="resource-mini-icon"><span class="resource-label">{{ res.label }}</span></div>
            <div class="resource-amount" :title="res.amount">{{ res.amount }}</div>
            <img :src="res.icon" alt="" aria-hidden="true" class="resource-big-icon">
          </div>
        </div>
        <p v-if="snapshot?.sectionErrors?.warehouse" class="data-warning">牧场库存读取失败，资源数量未知</p>
      </div>

      <RouterLink to="/ranch/personal" class="game-card farm-status-card">
        <div class="farm-status-left">
          <div class="farm-status-header">
            <div class="status-indicator"><span class="status-dot" :class="connection ? connection.connected ? 'online' : 'offline' : 'unknown'" /><span class="status-text">{{ connectionLabel }}</span></div>
            <span class="farm-status-label">{{ runLabel }}</span>
          </div>
          <div class="farm-metrics">
            <div v-for="check in checks" :key="check.key" class="farm-metric">
              <span class="farm-metric-icon" :class="`metric-${check.key}`"><span :class="check.icon" /></span>
              <div class="farm-metric-text"><span class="farm-metric-value" :title="check.hint || check.value">{{ check.value }}</span><span class="farm-metric-label">{{ check.label }}</span></div>
            </div>
            <div class="farm-metric">
              <span class="farm-metric-icon metric-uptime"><span class="i-carbon-time" /></span>
              <div class="farm-metric-text"><span class="farm-metric-value">{{ uptime }}</span><span class="farm-metric-label">账号已运行</span></div>
            </div>
          </div>
        </div>
        <div class="farm-scene"><img src="/ranch/pasture-background.webp" alt="牧场"><span class="farm-scene-arrow"><span class="i-carbon-chevron-right" /></span></div>
      </RouterLink>

      <div class="glass-panel">
        <div class="feature-grid">
          <RouterLink v-for="feature in featureCards" :key="feature.key" :to="feature.to" class="game-card feature-card" :class="`feat-${feature.key}`">
            <img :src="feature.icon" :alt="feature.title" class="feature-icon">
            <div class="feature-info"><div class="feature-title">{{ feature.title }}</div><div class="feature-subtitle">{{ feature.subtitle }}</div></div>
            <span class="card-arrow i-carbon-chevron-right" />
          </RouterLink>
        </div>
      </div>


      <div class="home-stats-panel">
        <div class="home-log-head"><h3>账号统计</h3></div>
        <div v-if="currentAccountDisconnected" class="home-stats-empty">
          <div class="i-carbon-connection-signal-off text-4xl text-gray-400" />
          <div class="text-gray-700 font-medium dark:text-gray-300">账号未登录</div>
          <div class="mt-1 text-xs text-gray-400">请先运行账号或检查网络连接。</div>
        </div>
        <div v-else class="home-stats-grid">
          <div v-for="item in operationStatItems" :key="item.key" class="home-stat-item">
            <div class="min-w-0 flex items-center gap-1.5">
              <div class="text-base" :class="[getOpIcon(item.key), getOpColor(item.key)]" />
              <span class="home-stat-label" :title="ranchActionLabels[item.key] || item.key">{{ ranchActionLabels[item.key] || item.key }}</span>
            </div>
            <span class="home-stat-value">{{ formatDashboardValue(item.value) }}</span>
          </div>
        </div>
      </div>

      <!-- 运行日志面板（置于账号统计下方，页面最底部） -->
      <div class="home-log-panel">
        <div class="home-log-head"><h3>运行日志</h3><button class="home-log-latest" @click="scrollToLatest">最新<span class="i-carbon-arrow-down" /></button></div>
        <div class="home-log-filters">
          <select v-model="logFilter.module" class="home-log-filter-item" aria-label="日志模块"><option value="">全部模块</option><option v-for="module in logModules" :key="module" :value="module">{{ module }}</option></select>
          <select v-model="logFilter.event" class="home-log-filter-item" aria-label="日志事件"><option value="">全部事件</option><option v-for="event in logEvents" :key="event" :value="event">{{ ranchActionLabels[event] || event }}</option></select>
          <select v-model="logFilter.level" class="home-log-filter-item" aria-label="日志级别"><option value="">全部级别</option><option value="info">信息</option><option value="warn">警告</option><option value="error">错误</option></select>
          <input v-model="logFilter.keyword" class="home-log-filter-item home-log-keyword" aria-label="日志关键词" placeholder="关键词...">
          <button v-if="hasLogFilter" class="home-log-filter-item home-log-clear" @click="Object.assign(logFilter, { module: '', event: '', level: '', keyword: '' })">重置</button>
        </div>
        <div ref="homeLogContainer" class="home-log-list" @scroll="onLogScroll">
          <div v-if="!homeLogs.length" class="home-log-empty">{{ hasLogFilter ? '没有符合条件的日志' : '暂无日志' }}</div>
          <div v-for="log in homeLogs" :key="log.id" class="home-log-row" :class="`log-${log.level}`">
            <span class="home-log-time">{{ logTime(log) }}</span><span class="home-log-tag">{{ log.tag }}</span>
            <span class="home-log-msg">{{ log.msg }}<template v-if="(log.repeatCount || 1) > 1"> ×{{ log.repeatCount }}</template></span>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* Farm home visual contract, kept local so the existing farm dashboard stays unchanged. */
.dashboard-container { display: flex; width: 100%; min-height: 100%; align-items: flex-start; }
.game-home { display: flex; width: 100%; max-width: 760px; margin: 0 auto; flex-direction: column; gap: 10px; }
.game-card { position: relative; border-radius: 20px; border: 1.5px solid rgba(255,255,255,.65); background: linear-gradient(165deg,rgba(255,255,255,.58),rgba(255,255,255,.28)); box-shadow: 0 10px 28px rgba(31,38,80,.12),inset 0 1.5px 0 rgba(255,255,255,.85); backdrop-filter: blur(24px) saturate(1.35); -webkit-backdrop-filter: blur(24px) saturate(1.35); }
.empty-state { width: 100%; padding: 32px; text-align: center; color: #6b7280; }
.data-warning { padding: 10px 14px; font-size: 12px; color: #b91c1c; overflow-wrap: anywhere; }
.cache-hint { display: flex; align-items: center; gap: 6px; padding: 8px 14px; font-size: 12px; color: #475569; background: rgba(255,255,255,.55); border: 1px solid rgba(148,163,184,.35); }
.user-card { padding: 12px 16px; }
.user-info-row { display: flex; align-items: center; gap: 16px; }
.user-avatar-large { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 3px solid rgba(255,255,255,.95); box-shadow: 0 6px 16px rgba(31,38,80,.18); flex-shrink: 0; }
.user-details { flex: 1; min-width: 0; }
.user-name-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.user-name { font-size: 17px; font-weight: 700; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.user-level { background: linear-gradient(135deg,#34d399,#10b981); color: #fff; padding: 3px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.exp-bar-row { display: flex; align-items: center; gap: 12px; }
.exp-progress-bar { flex: 1; min-width: 32px; height: 10px; border-radius: 999px; background: rgba(31,38,80,.08); overflow: hidden; box-shadow: inset 0 1px 3px rgba(31,38,80,.08); }
.exp-progress-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg,#4ade80,#22c55e); box-shadow: 0 0 8px rgba(34,197,94,.5); transition: width .5s ease; }
.exp-total { font-size: 13px; font-weight: 600; color: #4b5563; overflow-wrap: anywhere; }
.exp-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; margin-top: 5px; font-size: 12px; color: #6b7280; }
.exp-rate { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 5px; font-weight: 500; }
.exp-observation-label { font-size: 11px; }
.level-up-time { display: flex; flex-wrap: wrap; gap: 4px 10px; min-width: 0; overflow-wrap: anywhere; }
.level-need { color: #6b7280; }
@media (max-width:640px) { .level-up-time { flex-direction: column; gap: 2px; } }
.exp-bolt { color: #3b82f6; }
.resource-cards { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 10px; }
.resource-card { padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; min-height: 84px; overflow: hidden; }
.res-gold { background: linear-gradient(165deg,rgba(255,224,145,.6),rgba(255,248,228,.24)); }
.res-bean { background: linear-gradient(165deg,rgba(255,216,160,.6),rgba(255,246,232,.24)); }
.res-coupon { background: linear-gradient(165deg,rgba(178,240,205,.6),rgba(240,252,244,.24)); }
.res-diamond { background: linear-gradient(165deg,rgba(183,222,252,.6),rgba(238,248,255,.24)); }
.res-can-normal { background: linear-gradient(165deg,rgba(222,196,166,.6),rgba(250,244,235,.24)); }
.res-can-organic { background: linear-gradient(165deg,rgba(198,240,156,.6),rgba(244,252,236,.24)); }
.res-grass { background: linear-gradient(165deg,rgba(196,240,168,.6),rgba(244,253,236,.24)); }
.res-poop { background: linear-gradient(165deg,rgba(226,214,190,.6),rgba(250,246,238,.24)); }
.res-crop { background: linear-gradient(165deg,rgba(255,199,220,.6),rgba(255,243,248,.24)); }
.res-mutant { background: linear-gradient(165deg,rgba(216,192,252,.6),rgba(246,241,255,.24)); }
.resource-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.resource-mini-icon { width: 20px; height: 20px; object-fit: contain; flex-shrink: 0; }
.resource-label { font-size: 13px; font-weight: 600; color: #4b5563; white-space: nowrap; overflow: hidden; }
.resource-amount { position: relative; z-index: 1; max-width: 100%; font-size: 19px; font-weight: 800; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.res-gold .resource-amount { color: #d97706; }.res-bean .resource-amount { color: #c2620a; }.res-coupon .resource-amount { color: #059669; }.res-diamond .resource-amount { color: #0284c7; }.res-can-normal .resource-amount { color: #92610f; }.res-can-organic .resource-amount { color: #55800a; }.res-grass .resource-amount { color: #4d7c0f; }.res-poop .resource-amount { color: #7c5a1e; }.res-crop .resource-amount { color: #d6336c; }.res-mutant .resource-amount { color: #7048e8; }
.resource-big-icon { position: absolute; right: 4px; bottom: 2px; width: 42px; height: 42px; object-fit: contain; filter: drop-shadow(0 4px 8px rgba(31,38,80,.2)); pointer-events: none; }
.card-arrow { margin-left: auto; font-size: 14px; color: rgba(55,65,81,.35); flex-shrink: 0; }
.farm-status-card { display: flex; align-items: stretch; justify-content: space-between; gap: 12px; padding: 12px 16px; min-height: 112px; overflow: hidden; text-decoration: none; }
.farm-status-left { display: flex; min-width: 0; flex: 1; flex-direction: column; justify-content: flex-start; gap: 8px; }
.farm-status-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.status-indicator { display: flex; align-items: center; gap: 7px; }
.status-dot { width: 10px; height: 10px; border-radius: 50%; }
.status-dot.online { background: #22c55e; box-shadow: 0 0 10px rgba(34,197,94,.6); }.status-dot.offline { background: #ef4444; }.status-dot.unknown { background: #9ca3af; }
.status-text { color: #374151; font-weight: 700; font-size: 15px; }
.farm-status-label { color: #16a34a; border: 1.5px solid rgba(34,197,94,.55); background: rgba(34,197,94,.08); border-radius: 999px; padding: 2px 12px; font-size: 12px; font-weight: 600; }
.farm-metrics { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px 14px; width: 100%; }
.farm-metric { display: flex; min-width: 0; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 10px; background: transparent; border: 0; }
.farm-metric-icon { display: flex; height: 30px; width: 30px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 50%; color: #fff; font-size: 15px; }
.metric-farm { background: linear-gradient(135deg,#4ade80,#22c55e); }.metric-help { background: linear-gradient(135deg,#60a5fa,#3b82f6); }.metric-steal { background: linear-gradient(135deg,#fb923c,#f97316); }.metric-uptime { background: linear-gradient(135deg,#34d399,#10b981); }
.farm-metric-text { display: flex; min-width: 0; flex-direction: column; line-height: 1.25; }
.farm-metric-value { font-size: 14px; font-weight: 700; font-family: 'DM Mono','Courier New',monospace; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.farm-metric-label { color: #6b7280; font-size: 11px; }
.farm-scene { position: relative; display: flex; width: 22%; max-width: 150px; flex-shrink: 0; margin: -16px -18px -16px 0; border-radius: 0 18px 18px 0; overflow: hidden; mask-image: linear-gradient(90deg,transparent,#000 16%); -webkit-mask-image: linear-gradient(90deg,transparent,#000 16%); }
.farm-scene img { width: 100%; height: 100%; object-fit: cover; opacity: .92; }
.farm-scene-arrow { position: absolute; top: 50%; right: 8px; transform: translateY(-50%); display: flex; height: 26px; width: 26px; align-items: center; justify-content: center; border-radius: 50%; background: rgba(255,255,255,.75); color: #4b5563; font-size: 14px; }
.glass-panel { border-radius: 24px; border: 1px solid rgba(255,255,255,.5); background: rgba(255,255,255,.32); box-shadow: 0 10px 30px rgba(31,38,80,.1); backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px); padding: 12px; }
.feature-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
.feature-card { padding: 14px; display: flex; align-items: center; gap: 10px; min-width: 0; text-decoration: none; }
.feat-crop { background: linear-gradient(165deg,rgba(196,242,214,.6),rgba(245,253,247,.26)); }.feat-pet { background: linear-gradient(165deg,rgba(255,228,196,.6),rgba(255,250,240,.26)); }.feat-book { background: linear-gradient(165deg,rgba(200,226,252,.6),rgba(243,249,255,.26)); }.feat-shop { background: linear-gradient(165deg,rgba(255,214,168,.6),rgba(255,247,235,.26)); }.feat-gift { background: linear-gradient(165deg,rgba(250,210,232,.6),rgba(253,245,250,.26)); }.feat-chart { background: linear-gradient(165deg,rgba(193,240,235,.6),rgba(242,252,251,.26)); }
.feature-icon { width: 46px; height: 46px; border-radius: 14px; object-fit: contain; flex-shrink: 0; filter: drop-shadow(0 3px 6px rgba(31,38,80,.15)); }
.feature-info { flex: 1; min-width: 0; }.feature-title { font-size: 14px; font-weight: 700; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.feature-subtitle { font-size: 12px; color: #6b7280; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-stats-panel,.home-log-panel { display: flex; flex-direction: column; gap: 10px; border-radius: 20px; padding: 16px 18px; background: linear-gradient(180deg,rgba(186,226,248,.35),rgba(255,255,255,.08) 45%,rgba(134,214,152,.4)),linear-gradient(165deg,rgba(255,255,255,.55),rgba(255,255,255,.26)); border: 1.5px solid rgba(255,255,255,.65); box-shadow: 0 10px 28px rgba(31,38,80,.12),inset 0 1.5px 0 rgba(255,255,255,.85); backdrop-filter: blur(24px) saturate(1.35); -webkit-backdrop-filter: blur(24px) saturate(1.35); overflow: hidden; }
.home-stats-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px 10px; }.home-stat-item { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,.35); }.home-stat-icon { flex-shrink: 0; }.home-stat-label { min-width: 0; flex: 1; overflow: hidden; color: #4b5563; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.home-stat-value { margin-left: auto; text-align: right; font-variant-numeric: tabular-nums; flex-shrink: 0; color: #166534; font-size: 14px; font-weight: 700; font-family: 'DM Mono','Courier New',monospace; }.home-stats-empty { display: flex; min-height: 120px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; padding: 20px; text-align: center; background: rgba(255,255,255,.35); }.home-stat-value-pill { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; min-width: 52px; border-radius: 999px; padding: 4px 12px; background: linear-gradient(135deg,#34d399,#10b981); color: #fff; font-size: 14px; font-weight: 800; font-family: 'DM Mono','Courier New',monospace; box-shadow: 0 3px 8px rgba(31,38,80,.18); }
.stats-note { font-size: 11px; color: #6b7280; }
.home-log-panel { min-height: 320px; max-height: 440px; }.home-log-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }.home-log-head h3 { font-size: 20px; font-weight: 800; color: #166534; margin: 0; letter-spacing: 1px; }.home-log-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }.home-log-filter-item { min-width: 0; border: 1px solid rgba(255,255,255,.7); border-radius: 10px; padding: 4px 8px; background: rgba(255,255,255,.72); color: #374151; font-size: 12px; line-height: 1.4; }.home-log-filter-item:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }select.home-log-filter-item { max-width: 128px; cursor: pointer; }.home-log-keyword { flex: 1; min-width: 96px; }.home-log-clear { color: #b91c1c; }.home-log-list { flex: 1; min-height: 0; min-width: 0; overflow-y: auto; overflow-x: hidden; border-radius: 12px; padding: 4px 6px; background: rgba(255,255,255,.35); overscroll-behavior: contain; }.home-log-empty { display: flex; min-height: 120px; align-items: center; justify-content: center; color: #6b7280; font-size: 13px; }.home-log-row { display: flex; align-items: baseline; gap: 8px; padding: 4px 6px; border-radius: 8px; font-size: 13px; line-height: 1.5; }.home-log-time { flex-shrink: 0; color: #6b7280; font-size: 12px; font-family: 'DM Mono','Courier New',monospace; white-space: nowrap; }.home-log-tag { flex-shrink: 0; padding: 1px 6px; border-radius: 4px; color: #166534; background: rgba(220,252,231,.8); font-size: 12px; font-weight: 700; }.home-log-msg { min-width: 0; flex: 1; overflow-wrap: anywhere; color: #374151; }.log-error .home-log-msg { color: #dc2626; }.log-warn .home-log-msg { color: #b45309; }.home-log-latest { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; border: 0; border-radius: 999px; padding: 9px 18px; background: linear-gradient(135deg,#34d399,#10b981); color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 5px 14px rgba(16,185,129,.45),inset 0 0 0 2px rgba(255,255,255,.55); }
.feature-card,.farm-status-card { transition: transform .25s ease,box-shadow .25s ease; }.feature-card:hover,.farm-status-card:hover { transform: translateY(-3px); box-shadow: 0 14px 32px rgba(31,38,80,.16),inset 0 1.5px 0 rgba(255,255,255,.95); }
@media (max-width:640px) {
  .exp-meta { flex-direction: column; align-items: flex-start; gap: 4px; }.resource-cards { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }.resource-card { padding: 10px; min-height: 80px; }.resource-amount { font-size: 16px; }.resource-big-icon { width: 34px; height: 34px; }.user-card { padding: 14px 16px; }.user-avatar-large { width: 54px; height: 54px; }.user-name { font-size: 16px; }.farm-scene { width: 20%; }.home-log-panel { min-height: 260px; max-height: 360px; padding: 12px 14px; }.home-log-head h3 { font-size: 17px; }.home-log-latest { padding: 8px 14px; font-size: 13px; }
}
@media (max-width:560px) { .glass-panel { padding: 8px; }.feature-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; } }
@media (max-width:480px) {
  .resource-cards { gap: 6px; }.resource-card { padding: 8px; min-height: 74px; border-radius: 16px; }.resource-label { font-size: 11px; }.resource-head { gap: 3px; }.resource-mini-icon { width: 14px; height: 14px; }.resource-amount { font-size: 13px; }.resource-big-icon { right: 2px; bottom: 0; width: 34px; height: 34px; }.farm-status-card { gap: 8px; }.farm-scene { width: 18%; }.farm-metrics { gap: 8px; }.farm-metric { gap: 6px; }.farm-metric-icon { width: 24px; height: 24px; font-size: 12px; }.farm-metric-value { font-size: 12px; }.farm-metric-label { font-size: 10px; }.card-arrow { font-size: 11px; }.feature-grid { gap: 6px; }.feature-card { padding: 10px; border-radius: 16px; }.feature-icon { width: 36px; height: 36px; border-radius: 11px; }.feature-title { font-size: 12px; }.feature-subtitle { font-size: 10px; }.game-card { border-radius: 16px; }.home-log-panel { min-height: 240px; max-height: 340px; border-radius: 16px; padding: 10px 12px; gap: 8px; }.home-log-head h3 { font-size: 15px; }.home-log-row { flex-wrap: wrap; font-size: 12px; padding: 3px 4px; }.home-log-msg { flex-basis: 100%; }.home-stats-panel { padding: 12px 14px; border-radius: 16px; }.home-stats-grid { gap: 5px 8px; }.home-stat-item { padding: 5px 6px; gap: 6px; }.home-stat-label { font-size: 12px; }.home-stat-value-pill { min-width: 40px; padding: 3px 8px; font-size: 12px; }
}
@media (max-width: 480px) {
  .resource-card { min-width: 0; }
  .resource-label, .resource-amount {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .resource-big-icon { opacity: .25; }
  .farm-status-card { padding: 12px; }
  .farm-scene { display: none; }
  .farm-metric { padding-inline: 0; }
  .farm-metric-value {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .home-stat-value { font-size: 13px; }
}
@media (prefers-reduced-motion:reduce) { .feature-card,.farm-status-card,.exp-progress-fill { transition: none; } }
</style>
