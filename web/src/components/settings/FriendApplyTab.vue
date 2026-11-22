<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import PoolReadStatus from '@/components/friends/PoolReadStatus.vue'
import { useAccountStore } from '@/stores/account'
import {
  allowUnknownLevel,
  cancelled,
  delayMs,
  poolDailyLimit,
  progress,
  results,
  running,
  selectedAccountIds,
} from '@/stores/friend-import'
import { useToastStore } from '@/stores/toast'

/**
 * 设置 → 好友申请
 *
 * 号池链接统一由 管理后台 → 好友号池 导入和删除；本页只做「查看 + 添加好友」：
 * 上方是号池概览，下面是本账号的筛选配置（等级区间 + 犬种）和申请记录，
 * 按筛选结果批量发申请，不再展示逐条链接列表（列表在管理后台维护）。
 */
const accountStore = useAccountStore()
const toast = useToastStore()

const CHUNK_SIZE = 10
const MAX_LEVEL = 400
const DOG_BREEDS = ['无狗', '比熊犬', '柯基', '斑点狗', '牧羊犬', '田园犬', '护主犬', '未知'] as const
const NO_DOG = '无狗'
const UNKNOWN_BREED = '未知'

interface PoolEntry {
  uid: string
  openid: string
  shareSource: string
  docId: string
  shareKey: string
  cardTime: string
  name: string
  level: number | null
  dogBreed?: string
  dogAbsent?: boolean
  levelFetchedAt?: number
  dogFetchedAt?: number
  firstSeenAt: number
  updatedAt: number
  status: 'new' | 'pending' | 'friend' | 'dead'
  visitClosed?: boolean
  visitClosedAt?: number
}

interface FilterStats {
  total: number
  identified: number
  coverage: number
  poolMaxLevel: number
  addableTotal: number
  matched: number
  dogCounts: Record<string, number>
}

/** 申请记录：每个账号单独一份，历史累计（同意/拒绝/还在等） */
interface ApplyRecord {
  uid: string
  name: string
  level: number
  status: 'friend' | 'pending' | 'dead'
  applyCount: number
  lastApplyAt: number
  deadReason?: string
}

const entries = ref<PoolEntry[]>([])
const loading = ref(false)
const fetchingLevels = ref(false)
// 再点一次「读取等级」表示停止：只影响这一轮，已读到的数据保留
const levelFetchCancelled = ref(false)

const filterMinLevel = ref(0)
// 最高等级 0 / 空 = 不设上限（默认）
const filterMaxLevel = ref<number | ''>(0)
const dogBreeds = ref<string[]>([])
const stats = ref<FilterStats | null>(null)
const statsLoading = ref(false)

const applyRecords = ref<ApplyRecord[]>([])
const applyCounts = ref({ total: 0, friend: 0, pending: 0, expired: 0, dead: 0 })

const delayOptions = [
  { label: '1 秒', value: 1000 },
  { label: '2 秒（推荐）', value: 2000 },
  { label: '3 秒', value: 3000 },
  { label: '5 秒', value: 5000 },
]

const wxAccounts = computed(() =>
  accountStore.accounts.filter(acc => ['wx', 'wechat'].includes(String(acc.platform || '').toLowerCase())),
)

const selectedAccountId = computed({
  get: () => selectedAccountIds.value[0] || '',
  set: (value: string) => { selectedAccountIds.value = value ? [value] : [] },
})

const currentAccountName = computed(() => {
  const account = wxAccounts.value.find(acc => String(acc.id) === selectedAccountId.value)
  return account ? (account.name || String(account.id)) : ''
})

/** 号池概览（本账号视角）：正常/已失效/拜访关闭的划分与管理后台一致 */
const summary = computed(() => {
  const total = entries.value.length
  const withKey = entries.value.filter(entry => Boolean(entry.shareKey)).length
  const visitClosed = entries.value.filter(entry => entry.visitClosed === true && !isExpired(entry)).length
  const expired = entries.value.filter(entry => isExpired(entry)).length
  const valid = total - expired - visitClosed
  const withLevel = entries.value.filter(entry => Number(entry.level) > 0).length
  return { total, withKey, valid, expired, visitClosed, withLevel }
})

/** 已失效 = 没有 share_key 或已被判定不可加（拜访关闭单独一列，不算失效） */
function isExpired(entry: PoolEntry) {
  return !entry.shareKey || entry.status === 'dead'
}

/**
 * 条目的犬种：识别出品种 → 该品种；确认没有狗 → 无狗；
 * 还没读过 / 有狗但读不出品种 → 未知（「无狗」不能拿「没读到」来凑）。
 */
function breedOf(entry: PoolEntry) {
  if (entry.dogBreed)
    return entry.dogBreed
  return entry.dogAbsent ? NO_DOG : UNKNOWN_BREED
}

/** 按「当前筛选条件」挑出待添加的条目（只发还没申请过、带 share_key 的） */
const applyTargets = computed(() => entries.value.filter((entry) => {
  if (entry.status !== 'new' || !entry.shareKey)
    return false
  const level = Number(entry.level) || 0
  // 没读到等级的条目只在勾选「等级查不到也加」时才参与，否则筛选结果对不上
  if (level === 0 && !allowUnknownLevel.value)
    return false
  const maxLevel = Number(filterMaxLevel.value) || 0
  if (level > 0 && level < filterMinLevel.value)
    return false
  if (level > 0 && maxLevel > 0 && level > maxLevel)
    return false
  if (dogBreeds.value.length > 0 && !dogBreeds.value.includes(breedOf(entry)))
    return false
  return true
}))

const applyItems = computed(() => applyTargets.value.map(entry => ({
  uid: String(entry.uid),
  openid: String(entry.openid || ''),
  shareSource: String(entry.shareSource || ''),
  shareKey: String(entry.shareKey || ''),
})))

const progressPercent = computed(() => {
  if (progress.value.total <= 0)
    return 0
  return Math.min(100, Math.round((progress.value.done / progress.value.total) * 100))
})

const applySummary = computed(() => ({
  success: results.value.filter(r => r.ok).length,
  visitClosed: results.value.filter(r => r.visitClosed).length,
  skipped: results.value.filter(r => r.skipped && !r.visitClosed).length,
  failed: results.value.filter(r => !r.ok && !r.skipped && !r.visitClosed).length,
}))

const dogCount = computed(() => (breed: string) => stats.value?.dogCounts?.[breed] || 0)

const APPLY_STATUS_LABEL: Record<string, string> = {
  friend: '已同意',
  pending: '待通过',
  expired: '已过期',
  dead: '已拒绝',
}

function applyStatusLabel(status: string) {
  return APPLY_STATUS_LABEL[status] || status
}

function applyStatusClass(status: string) {
  if (status === 'friend')
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
  if (status === 'expired')
    return 'bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400'
  if (status === 'dead')
    return 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'
  return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
}

function formatApplyTime(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function accountHeader() {
  return selectedAccountId.value ? { 'x-account-id': selectedAccountId.value } : {}
}

function clampLevel(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.min(Math.max(Math.round(value), 0), MAX_LEVEL)
}

async function load() {
  if (!selectedAccountId.value) {
    entries.value = []
    return
  }
  loading.value = true
  try {
    const res = await api.get('/api/friends/pool', { headers: accountHeader() })
    if (res.data?.ok) {
      const data = res.data.data || {}
      entries.value = Array.isArray(data.entries) ? data.entries : []
      if (data.dailyLimit)
        poolDailyLimit.value = data.dailyLimit
    }
    else {
      toast.error(res.data?.error || '读取好友号池失败')
    }
  }
  catch (error: any) {
    if (error?.response?.data?.errorType === 'vip_required')
      canUse.value = false
    toast.error(error?.response?.data?.error || '读取好友号池失败')
  }
  finally {
    loading.value = false
  }
}

async function loadFilter() {
  if (!selectedAccountId.value)
    return
  try {
    const res = await api.get('/api/friends/pool/filter', { headers: accountHeader() })
    if (res.data?.ok) {
      const filter = res.data.data?.filter || {}
      filterMinLevel.value = Number(filter.minLevel) || 0
      filterMaxLevel.value = Number(filter.maxLevel) > 0 ? Number(filter.maxLevel) : 0
      dogBreeds.value = Array.isArray(filter.dogBreeds) ? [...filter.dogBreeds] : []
    }
  }
  catch (_) {
    // 读取保存的筛选条件失败时用默认值即可
  }
}

async function refreshStats() {
  if (!selectedAccountId.value)
    return
  statsLoading.value = true
  try {
    const res = await api.get('/api/friends/pool/stats', {
      headers: accountHeader(),
      params: {
        minLevel: filterMinLevel.value,
        maxLevel: Number(filterMaxLevel.value) || 0,
        dogBreeds: dogBreeds.value.join(','),
        allowUnknownLevel: allowUnknownLevel.value ? 1 : 0,
      },
    })
    if (res.data?.ok)
      stats.value = res.data.data || null
  }
  catch (_) {
    stats.value = null
  }
  finally {
    statsLoading.value = false
  }
}

async function refreshRecords() {
  if (!selectedAccountId.value)
    return
  try {
    const res = await api.get('/api/friends/pool/applications', {
      headers: accountHeader(),
      timeout: 30000,
    } as any)
    if (res.data?.ok) {
      const data = res.data.data || {}
      applyRecords.value = Array.isArray(data.records) ? data.records : []
      applyCounts.value = data.counts || { total: 0, friend: 0, pending: 0, expired: 0, dead: 0 }
    }
  }
  catch (_) {
    // 拉不到时保留上一次记录，别让表格闪空
  }
}

async function saveFilter() {
  if (!selectedAccountId.value) {
    toast.error('先选择执行账号')
    return
  }
  filterMinLevel.value = clampLevel(filterMinLevel.value)
  // 最高等级空着 = 不设上限，只有填了正数才夹到 0..MAX_LEVEL
  const rawMax = Number(filterMaxLevel.value)
  filterMaxLevel.value = Number.isFinite(rawMax) && rawMax > 0 ? clampLevel(rawMax) : 0
  if (filterMaxLevel.value > 0 && filterMinLevel.value > filterMaxLevel.value)
    filterMaxLevel.value = filterMinLevel.value
  try {
    const res = await api.post('/api/friends/pool/filter', {
      minLevel: filterMinLevel.value,
      maxLevel: Number(filterMaxLevel.value) || 0,
      dogBreeds: dogBreeds.value,
      allowUnknownLevel: allowUnknownLevel.value,
    }, { headers: accountHeader() })
    if (res.data?.ok) {
      stats.value = res.data.data?.stats || stats.value
      toast.success('筛选条件已保存，按这个条件添加好友')
    }
    else {
      toast.error(res.data?.error || '保存筛选条件失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '保存筛选条件失败')
  }
}

function resetFilter() {
  filterMinLevel.value = 0
  filterMaxLevel.value = 0
  dogBreeds.value = []
  refreshStats()
}

function toggleBreed(breed: string) {
  const selected = dogBreeds.value.includes(breed)
  if (selected) {
    dogBreeds.value = dogBreeds.value.filter(value => value !== breed)
  }
  else if (breed === NO_DOG) {
    dogBreeds.value = [NO_DOG]
  }
  else {
    dogBreeds.value = [...dogBreeds.value.filter(value => value !== NO_DOG), breed]
  }
  refreshStats()
}

/** 读取还没识别过的条目资料（昵称/等级/犬种）：一次请求条数别太大，分批读，避免超时 */
const LEVEL_CHUNK_SIZE = 10

async function fetchLevels() {
  if (fetchingLevels.value) {
    // 再按一次就停：当前这一批会跑完，后面的不再发
    levelFetchCancelled.value = true
    toast.info('正在停止读取，当前这一批读完后停止')
    return
  }
  if (!selectedAccountId.value || running.value)
    return
  const uids = entries.value
    // 等级或犬种任一项没读到就补（旧数据只有等级，没有 dogFetchedAt）
    .filter(entry => Boolean(entry.shareKey) && (!(Number(entry.level) > 0) || !entry.dogFetchedAt))
    .map(entry => entry.uid)
  if (uids.length === 0) {
    toast.info('号池里的条目都已经读过等级了')
    return
  }
  fetchingLevels.value = true
  let okCount = 0
  let failedCount = 0
  let closedCount = 0
  let firstError = ''
  try {
    for (let index = 0; index < uids.length; index += LEVEL_CHUNK_SIZE) {
      if (levelFetchCancelled.value)
        break
      const chunk = uids.slice(index, index + LEVEL_CHUNK_SIZE)
      const res = await api.post('/api/friends/pool/fetch-levels', {
        uids: chunk,
        delayMs: 300,
      }, { headers: accountHeader(), timeout: 180000, skipErrorToast: true } as any)
      if (!res.data?.ok) {
        toast.error(res.data?.error || '读取等级失败')
        break
      }
      const data = res.data.data || {}
      okCount += Number(data.ok) || 0
      failedCount += Number(data.failed) || 0
      closedCount += Number(data.visitClosed) || 0
      const failedRows = Array.isArray(data.results) ? data.results.filter((row: any) => !row.ok) : []
      if (!firstError && failedRows.length > 0)
        firstError = failedRows[0].error || '未知原因'
    }
    const otherFailed = Math.max(0, failedCount - closedCount)
    const summary = `成功 ${okCount} 条${closedCount > 0 ? `，拜访关闭 ${closedCount} 条` : ''}${otherFailed > 0 ? `，其他失败 ${otherFailed} 条` : ''}`
    if (levelFetchCancelled.value)
      toast.info(`已停止读取：${summary}`)
    else if (okCount === 0 && closedCount === 0 && failedCount > 0)
      toast.error(`读取等级失败：${firstError}`)
    else
      toast.success(`读取完成：${summary}`)
    await Promise.all([load(), refreshStats()])
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || error?.message || '读取等级失败')
  }
  finally {
    fetchingLevels.value = false
    levelFetchCancelled.value = false
  }
}

async function startApply() {
  if (running.value)
    return
  if (!selectedAccountId.value) {
    toast.error('先选择执行账号')
    return
  }
  const account = wxAccounts.value.find(acc => String(acc.id) === selectedAccountId.value)
  if (!account) {
    toast.error('选中的账号不是微信账号，只有微信账号能通过分享链接加好友')
    return
  }
  if (poolDailyLimit.value?.blocked) {
    toast.error(`本账号今日的申请次数已达上限，${new Date().toLocaleDateString('zh-CN')} 后再试`)
    return
  }
  const items = applyItems.value
  if (items.length === 0) {
    toast.info('没有符合筛选条件的待添加条目：可放宽等级区间或犬种后再试')
    return
  }

  running.value = true
  cancelled.value = false
  progress.value = { done: 0, total: items.length }
  results.value = []

  try {
    for (let index = 0; index < items.length; index += CHUNK_SIZE) {
      if (cancelled.value)
        break
      const chunk = items.slice(index, index + CHUNK_SIZE)
      const res = await api.post('/api/friends/apply-invites', {
        items: chunk,
        delayMs: delayMs.value,
        minLevel: filterMinLevel.value,
        maxLevel: Number(filterMaxLevel.value) || 0,
        dogBreeds: dogBreeds.value,
        allowUnknownLevel: allowUnknownLevel.value,
      }, {
        headers: accountHeader(),
        timeout: 180000,
        skipErrorToast: true,
      } as any)
      const data = res.data?.data
      if (!res.data?.ok || !data) {
        toast.error(res.data?.error || '添加好友失败')
        break
      }
      if (Array.isArray(data.results)) {
        for (const row of data.results) {
          results.value.push({
            accountId: selectedAccountId.value,
            accountName: currentAccountName.value,
            uid: String(row.uid || ''),
            ok: Boolean(row.ok),
            skipped: Boolean(row.skipped),
            existing: Boolean(row.existing),
            visitClosed: Boolean(row.visitClosed),
            level: row.level ?? null,
            name: row.name || '',
            error: row.error || '',
          })
        }
      }
      progress.value = {
        done: Math.min(items.length, index + chunk.length),
        total: items.length,
      }
      if (data.limitReached) {
        poolDailyLimit.value = { blocked: true, dateKey: '', at: Date.now(), error: '好友申请已达上限' }
        toast.error('本账号今日好友申请已达上限（1005027），明天再试')
        break
      }
      if (data.switchBlocked) {
        toast.error(data.error || '游戏里「点击分享链接可拜访好友」开关不可用')
        break
      }
      if (cancelled.value)
        break
      if (index + CHUNK_SIZE < items.length)
        await new Promise(resolve => setTimeout(resolve, Number(delayMs.value) || 2000))
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '添加好友失败')
  }
  finally {
    running.value = false
    await Promise.all([load(), refreshStats(), refreshRecords()])
  }
}

function stopApply() {
  cancelled.value = true
}

watch(allowUnknownLevel, () => { refreshStats() })

watch(selectedAccountId, async () => {
  await loadFilter()
  await Promise.all([load(), refreshStats(), refreshRecords()])
})

const canUse = ref(true)

async function checkVip() {
  try {
    const res = await api.get('/api/user/me')
    const user = res.data?.data ?? res.data ?? {}
    canUse.value = user?.vip === true || user?.role === 'super_admin'
  }
  catch {
    // 接口异常时不拦，交给后端 403 兜底
  }
}

onMounted(async () => {
  await checkVip()
  if (!canUse.value)
    return
  if (accountStore.accounts.length === 0)
    await accountStore.fetchAccounts()
  if (!selectedAccountId.value) {
    const current = accountStore.currentAccount
    const preferred = current && ['wx', 'wechat'].includes(String(current.platform || '').toLowerCase())
      ? current
      : wxAccounts.value[0]
    if (preferred)
      selectedAccountIds.value = [String(preferred.id)]
  }
  await loadFilter()
  await Promise.all([load(), refreshStats(), refreshRecords()])
})
</script>

<template>
  <div class="space-y-3">
    <div v-if="!canUse" class="border rounded-xl p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300" style="border-color: var(--surface-border);">
      <div class="mb-1 text-base font-semibold text-gray-800 dark:text-gray-100">
        好友申请是 VIP 功能
      </div>
      <p>当前账号还没开通 VIP。到「卡密中心」核销一张带 VIP 权限的卡密，或在用户管理里让管理员勾选 VIP 后刷新页面即可使用。</p>
    </div>
    <template v-if="canUse">
    <!-- 号池概览 -->
    <div class="grid grid-cols-2 gap-2 md:grid-cols-6">
      <div class="rounded-lg bg-white px-3 py-1.5 shadow-sm dark:bg-gray-800">
        <div class="text-xs text-gray-500 dark:text-gray-400">链接总数</div>
        <div class="text-lg font-semibold text-gray-800 dark:text-gray-100">{{ summary.total }}</div>
      </div>
      <div class="rounded-lg bg-white px-3 py-1.5 shadow-sm dark:bg-gray-800">
        <div class="text-xs text-gray-500 dark:text-gray-400">有分享密钥</div>
        <div class="text-lg font-semibold text-gray-800 dark:text-gray-100">{{ summary.withKey }}</div>
      </div>
      <div class="rounded-lg bg-white px-3 py-1.5 shadow-sm dark:bg-gray-800">
        <div class="text-xs text-gray-500 dark:text-gray-400">正常</div>
        <div class="text-lg font-semibold text-blue-600 dark:text-blue-400">{{ summary.valid }}</div>
      </div>
      <div class="rounded-lg bg-white px-3 py-1.5 shadow-sm dark:bg-gray-800">
        <div class="text-xs text-gray-500 dark:text-gray-400">已失效</div>
        <div class="text-lg font-semibold text-red-500 dark:text-red-400">{{ summary.expired }}</div>
      </div>
      <div class="rounded-lg bg-white px-3 py-1.5 shadow-sm dark:bg-gray-800">
        <div class="text-xs text-gray-500 dark:text-gray-400">拜访关闭</div>
        <div class="text-lg font-semibold text-amber-600 dark:text-amber-400">{{ summary.visitClosed }}</div>
      </div>
      <div class="rounded-lg bg-white px-3 py-1.5 shadow-sm dark:bg-gray-800">
        <div class="text-xs text-gray-500 dark:text-gray-400">已读到等级</div>
        <div class="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{{ summary.withLevel }}</div>
      </div>
    </div>

    <p class="text-xs text-gray-500 dark:text-gray-400">
      「读取等级」会进一次对方农场（Enter→Leave），顺便读回昵称、农场等级、犬种和拜访状态：
      拜访关闭的条目会直接标出来，不用先试一次申请；没识别过犬种的条目在选了犬种时不会参与添加。
    </p>

    <div class="grid gap-3 lg:grid-cols-2">
      <!-- 筛选配置 -->
      <div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">筛选配置</h3>
          <div class="flex items-center gap-2">
            <select
              v-model="delayMs"
              class="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
            >
              <option v-for="option in delayOptions" :key="option.value" :value="option.value">
                间隔 {{ option.label }}
              </option>
            </select>
            <label class="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <input v-model="allowUnknownLevel" type="checkbox" class="h-3 w-3">
              等级查不到也加
            </label>
          </div>
        </div>

        <!-- 执行账号 -->
        <div class="mb-3">
          <div class="mb-1 text-xs text-gray-500 dark:text-gray-400">执行账号（仅微信账号能通过分享链接加好友）</div>
          <select
            v-model="selectedAccountId"
            class="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">请选择微信账号</option>
            <option v-for="account in wxAccounts" :key="account.id" :value="String(account.id)">
              {{ account.name || account.id }}
            </option>
          </select>
        </div>

        <!-- 等级区间 -->
        <div class="mb-3 flex items-end gap-2">
          <div class="flex-1">
            <div class="mb-1 text-xs text-gray-500 dark:text-gray-400">最低等级</div>
            <BaseInput v-model.number="filterMinLevel" type="number" min="0" max="400" @change="refreshStats" />
          </div>
          <span class="pb-2 text-xs text-gray-400">–</span>
          <div class="flex-1">
            <div class="mb-1 text-xs text-gray-500 dark:text-gray-400">最高等级</div>
            <BaseInput v-model.number="filterMaxLevel" type="number" min="0" max="400" placeholder="不填 = 不设上限" @change="refreshStats" />
          </div>
          <span class="pb-2 text-xs text-gray-400">不填=无上限</span>
        </div>

        <!-- 犬种 -->
        <div class="mb-3">
          <div class="mb-1 text-xs text-gray-500 dark:text-gray-400">
            犬种（多选，「无狗」与其他互斥；不选=不限）
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="breed in DOG_BREEDS"
              :key="breed"
              type="button"
              class="rounded-md border px-2 py-1 text-xs transition-colors"
              :class="dogBreeds.includes(breed)
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'border-gray-300 bg-white text-gray-600 hover:border-emerald-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300'"
              @click="toggleBreed(breed)"
            >
              {{ breed }}
              <span class="ml-1 text-[10px] opacity-70">{{ dogCount(breed) }}</span>
            </button>
          </div>
        </div>

        <!-- 当前可加人数 -->
        <div class="mb-3 flex items-center justify-between rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
          <span>当前条件可加人数</span>
          <span class="text-sm font-semibold">{{ statsLoading ? '…' : (stats?.matched ?? applyTargets.length) }}</span>
        </div>
        <p v-if="!statsLoading && stats && stats.matched === 0 && entries.length > 0" class="mb-3 text-[11px] leading-5 text-gray-400">
          号池里的条目要么已经申请过，要么还没读到等级/犬种：先点「读取等级」，或勾选上面的「等级查不到也加」。
        </p>

        <div class="mb-3 grid grid-cols-3 gap-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
          <div>号池总量 <span class="font-medium text-gray-700 dark:text-gray-200">{{ stats?.total ?? summary.total }}</span></div>
          <div>已识别 <span class="font-medium text-gray-700 dark:text-gray-200">{{ stats?.identified ?? summary.withLevel }}</span></div>
          <div>最高等级 <span class="font-medium text-gray-700 dark:text-gray-200">{{ stats?.poolMaxLevel ?? '-' }}</span></div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <BaseButton variant="secondary" size="sm" :disabled="loading || running" @click="load">
            刷新
          </BaseButton>
          <BaseButton variant="secondary" size="sm" :loading="fetchingLevels" :disabled="running" @click="fetchLevels">
            {{ fetchingLevels ? '停止读取' : '读取等级' }}
          </BaseButton>
          <BaseButton variant="secondary" size="sm" :disabled="running" @click="saveFilter">
            保存筛选
          </BaseButton>
          <BaseButton variant="ghost" size="sm" :disabled="running" @click="resetFilter">
            恢复默认
          </BaseButton>
          <BaseButton :loading="running" size="sm" @click="startApply">
            添加好友（{{ applyTargets.length }}）
          </BaseButton>
          <BaseButton v-if="running" variant="danger" size="sm" @click="stopApply">
            中止
          </BaseButton>
        </div>

        <PoolReadStatus class="mt-2" :account-id="selectedAccountId" />

        <!-- 进度与结果 -->
        <div v-if="progress.total > 0" class="mt-3">
          <div class="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>进度 {{ progress.done }}/{{ progress.total }}</span>
            <span>
              成功 {{ applySummary.success }} · 拜访关闭 {{ applySummary.visitClosed }} ·
              跳过 {{ applySummary.skipped }} · 失败 {{ applySummary.failed }}
            </span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div class="h-full rounded-full bg-emerald-500 transition-all" :style="{ width: `${progressPercent}%` }" />
          </div>
          <div v-if="poolDailyLimit?.blocked" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
            本账号今天已撞好友申请上限，明天再试。
          </div>
          <div v-if="results.length > 0" class="mt-2 max-h-48 overflow-auto rounded-md border border-gray-200 dark:border-gray-700">
            <table class="w-full text-[11px]">
              <thead class="bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                <tr>
                  <th class="px-2 py-1 text-left">昵称</th>
                  <th class="px-2 py-1 text-left">等级</th>
                  <th class="px-2 py-1 text-left">结果</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in results.slice(-100).reverse()" :key="`${row.uid}-${index}`" class="border-t border-gray-100 dark:border-gray-700">
                  <td class="px-2 py-1">{{ row.name || row.uid }}</td>
                  <td class="px-2 py-1">{{ row.level ?? '-' }}</td>
                  <td class="px-2 py-1" :class="row.ok ? 'text-emerald-600' : (row.visitClosed ? 'text-amber-600' : 'text-gray-500')">
                    {{ row.ok ? '已发送' : (row.visitClosed ? '拜访关闭' : (row.error || '跳过')) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 申请记录 -->
      <div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">申请记录</h3>
          <div class="flex flex-wrap items-center gap-2 text-[11px]">
            <span class="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">已同意 {{ applyCounts.friend }}</span>
            <span class="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">待通过 {{ applyCounts.pending }}</span>
            <span class="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500 dark:bg-gray-900 dark:text-gray-400">已过期 {{ applyCounts.expired }}</span>
            <span class="rounded bg-red-50 px-1.5 py-0.5 text-red-600 dark:bg-red-900/30 dark:text-red-300">已拒绝 {{ applyCounts.dead }}</span>
            <span class="text-gray-400">共 {{ applyCounts.total }} 条</span>
            <button
              class="rounded border border-gray-300 px-1.5 py-0.5 text-gray-600 hover:border-emerald-400 dark:border-gray-600 dark:text-gray-300"
              @click="refreshRecords"
            >
              刷新
            </button>
          </div>
        </div>
        <div v-if="applyRecords.length > 0" class="max-h-72 overflow-auto rounded-md border border-gray-200 dark:border-gray-700">
          <table class="w-full text-left text-xs">
            <thead class="sticky top-0 bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th class="px-2 py-1.5 font-medium">昵称</th>
                <th class="px-2 py-1.5 font-medium">等级</th>
                <th class="px-2 py-1.5 font-medium">申请时间</th>
                <th class="px-2 py-1.5 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in applyRecords" :key="record.uid" class="border-t border-gray-100 dark:border-gray-800">
                <td class="px-2 py-1.5">
                  {{ record.name || '（未读到昵称）' }}
                </td>
                <td class="px-2 py-1.5 text-gray-500">
                  {{ record.level > 0 ? `Lv.${record.level}` : '—' }}
                </td>
                <td class="px-2 py-1.5 text-gray-500">
                  {{ formatApplyTime(record.lastApplyAt) }}
                </td>
                <td class="px-2 py-1.5">
                  <span class="rounded px-1.5 py-0.5" :class="applyStatusClass(record.status)">
                    {{ applyStatusLabel(record.status) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="flex h-40 items-center justify-center rounded-md bg-gray-50 text-xs text-gray-400 dark:bg-gray-900">
          当前账号还没有申请记录：点「添加好友」后会在这里留下记录
        </div>
        <p class="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          每个账号单独记录，显示历史上所有申请；好友列表里出现了算「已同意」，超过 24 小时还没通过算「已过期」，对方明确拒绝或申请失败算「已拒绝」。
        </p>
      </div>
    </div>
    </template>
  </div>
</template>