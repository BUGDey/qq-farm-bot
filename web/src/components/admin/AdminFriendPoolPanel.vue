<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import PoolReadStatus from '@/components/friends/PoolReadStatus.vue'
import { useAccountStore } from '@/stores/account'
import { running, selectedAccountIds } from '@/stores/friend-import'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
const accountStore = useAccountStore()

/** 表格里的「24 小时冷却还剩多久」需要一个会自动走的时钟 */
const nowMs = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null

interface PoolEntry {
  uid: string
  openid: string
  shareSource: string
  docId: string
  shareKey: string
  cardTime: string
  name: string
  level: number | null
  firstSeenAt: number
  updatedAt: number
  pendingCount: number
  friendCount: number
  deadCount: number
  expiredCount?: number
  visitClosed?: boolean
  visitClosedAt?: number
  levelFetchedAt?: number
  dogFetchedAt?: number
}

interface PoolSummary {
  total: number
  withKey: number
  applied: number
  friend: number
  dead: number
  valid: number
  expired: number
  visitClosed: number
}

type StatusFilter = 'all' | 'valid' | 'expired' | 'visit-closed'
type LevelFilter = 'all' | 'none' | '10' | '20' | '30' | '50' | '80' | '100' | '130' | '150' | '200' | '250' | '300' | '350' | '400' | '450' | '500'
type ExportFormat = 'txt' | 'json'

const PAGE_SIZE = 50

const entries = ref<PoolEntry[]>([])
const summary = ref<PoolSummary>({ total: 0, withKey: 0, applied: 0, friend: 0, dead: 0, valid: 0, expired: 0, visitClosed: 0 })
const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const statusFilter = ref<StatusFilter>('all')
const levelFilter = ref<LevelFilter>('all')
const page = ref(1)
const selected = ref<string[]>([])
const importText = ref('')
const importing = ref(false)
const exportFormat = ref<ExportFormat>('txt')

const fetchingLevels = ref(false)
// 再点一次「读取等级」表示停止：当前这一批跑完后不再发下一批
const levelFetchCancelled = ref(false)

const filterOptions: { value: StatusFilter, label: string }[] = [
  { value: 'all', label: '全部链接' },
  { value: 'valid', label: '正常' },
  { value: 'expired', label: '已失效' },
  { value: 'visit-closed', label: '拜访关闭' },
]

const levelOptions: { label: string, value: LevelFilter }[] = [
  { label: '全部等级', value: 'all' },
  { label: '未读等级', value: 'none' },
  { label: '≥ 10 级', value: '10' },
  { label: '≥ 20 级', value: '20' },
  { label: '≥ 30 级', value: '30' },
  { label: '≥ 50 级', value: '50' },
  { label: '≥ 80 级', value: '80' },
  { label: '≥ 100 级', value: '100' },
  { label: '≥ 130 级', value: '130' },
  { label: '≥ 150 级', value: '150' },
  { label: '≥ 200 级', value: '200' },
  { label: '≥ 250 级', value: '250' },
  { label: '≥ 300 级', value: '300' },
  { label: '≥ 350 级', value: '350' },
  { label: '≥ 400 级', value: '400' },
  { label: '≥ 450 级', value: '450' },
  { label: '≥ 500 级', value: '500' },
]

const wxAccounts = computed(() =>
  accountStore.accounts.filter(acc => ['wx', 'wechat'].includes(String(acc.platform || '').toLowerCase())),
)

const withLevelCount = computed(() => entries.value.filter(entry => Number(entry.level) > 0).length)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const min = levelFilter.value === 'all' || levelFilter.value === 'none'
    ? 0
    : Number(levelFilter.value)
  return entries.value.filter((entry) => {
    const expired = !entry.shareKey || entry.deadCount > 0
    const visitClosed = !expired && entry.visitClosed === true
    if (statusFilter.value === 'valid' && (expired || visitClosed))
      return false
    if (statusFilter.value === 'expired' && !expired)
      return false
    if (statusFilter.value === 'visit-closed' && !visitClosed)
      return false
    if (levelFilter.value === 'none' && Number(entry.level) > 0)
      return false
    if (min > 0 && !(Number(entry.level) >= min))
      return false
    if (!kw)
      return true
    return [entry.uid, entry.openid, entry.name, entry.shareKey]
      .some(value => String(value || '').toLowerCase().includes(kw))
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
// 表头全选针对「全部筛选结果」，不再只针对当前页 50 条
const allSelected = computed(() => filtered.value.length > 0 && filtered.value.every(entry => selected.value.includes(entry.uid)))
const someSelected = computed(() => !allSelected.value && filtered.value.some(entry => selected.value.includes(entry.uid)))
const allCheckboxRef = ref<HTMLInputElement | null>(null)
watch([allSelected, someSelected], ([all, some]) => {
  if (allCheckboxRef.value) allCheckboxRef.value.indeterminate = some && !all
}, { immediate: true })

/** 状态优先级：已失效 > 拜访关闭 > 正常 */
function statusLabel(entry: PoolEntry) {
  if (!entry.shareKey || entry.deadCount > 0)
    return '已失效'
  if (entry.visitClosed)
    return '拜访关闭'
  return '正常'
}

function statusClass(entry: PoolEntry) {
  if (!entry.shareKey || entry.deadCount > 0)
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (entry.visitClosed)
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
}

function statusTitle(entry: PoolEntry) {
  if (!entry.shareKey)
    return '缺少 share_key，无法申请'
  if (entry.deadCount > 0)
    return `有账号判定不可加（${entry.deadCount} 个）· 待通过 ${entry.pendingCount} · 已过期 ${entry.expiredCount || 0} · 已加好友 ${entry.friendCount}`
  if (entry.visitClosed)
    return '拜访关闭：申请时返回 1002007，对方未开放拜访，暂时加不了'
  return `待通过 ${entry.pendingCount} · 已加好友 ${entry.friendCount}`
}

/** 上一次读取资料的时刻（等级/犬种取较新的那个） */
function lastReadAt(entry: PoolEntry) {
  return Math.max(Number(entry.levelFetchedAt) || 0, Number(entry.dogFetchedAt) || 0)
}

/** 读取后 24 小时冷却：显示还剩多久可以再读 */
function readCooldownText(entry: PoolEntry) {
  const at = lastReadAt(entry)
  if (!at) return '未读取'
  const left = at + 24 * 60 * 60 * 1000 - nowMs.value
  if (left <= 0) return '可再读'
  const hours = Math.floor(left / 3600000)
  const minutes = Math.floor((left % 3600000) / 60000)
  return hours > 0 ? `剩 ${hours}h${minutes}m` : `剩 ${minutes}m`
}

function formatTime(ts: number | null | undefined) {
  if (!ts)
    return '-'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function shortOpenid(value: string) {
  const text = String(value || '')
  return text.length > 18 ? `${text.slice(0, 10)}…${text.slice(-4)}` : text
}

async function load() {
  loading.value = true
  try {
    const res = await api.get('/api/admin/friend-pool')
    if (res.data?.ok) {
      entries.value = Array.isArray(res.data.entries) ? res.data.entries : []
      summary.value = res.data.summary || { total: 0, withKey: 0, applied: 0, friend: 0, dead: 0, valid: 0, expired: 0 }
      const alive = new Set(entries.value.map(entry => entry.uid))
      selected.value = selected.value.filter(uid => alive.has(uid))
      if (page.value > pageCount.value)
        page.value = pageCount.value
    }
    else {
      toast.error(res.data?.error || '读取好友号池失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '读取好友号池失败')
  }
  finally {
    loading.value = false
  }
}

function toggleAll() {
  // 全选/取消针对全部筛选结果（当前 302 条），不受分页 50 条限制
  if (allSelected.value) {
    const all = new Set(filtered.value.map(entry => entry.uid))
    selected.value = selected.value.filter(uid => !all.has(uid))
    return
  }
  const add = filtered.value.map(entry => entry.uid).filter(uid => !selected.value.includes(uid))
  selected.value.push(...add)
}

function selectNone() {
  selected.value = []
}

function toggleOne(uid: string) {
  if (selected.value.includes(uid))
    selected.value = selected.value.filter(value => value !== uid)
  else
    selected.value.push(uid)
}

async function removeUids(uids: string[], confirmText: string) {
  if (uids.length === 0 || saving.value)
    return
  if (!window.confirm(confirmText))
    return
  saving.value = true
  try {
    const res = uids.length === 1
      ? await api.post('/api/admin/friend-pool/remove', { uid: uids[0] })
      : await api.post('/api/admin/friend-pool/remove-batch', { uids })
    if (res.data?.ok) {
      const removed = Number(res.data.data?.removed) || 0
      toast.success(`已删除 ${removed} 条链接`)
      selected.value = selected.value.filter(uid => !uids.includes(uid))
      await load()
    }
    else {
      toast.error(res.data?.error || '删除失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '删除失败')
  }
  finally {
    saving.value = false
  }
}

function removeOne(entry: PoolEntry) {
  void removeUids([entry.uid], `删除号池里的 uid=${entry.uid}？删除后所有账号都不再使用这条链接。`)
}

function removeSelected() {
  const uids = [...selected.value]
  void removeUids(uids, `删除选中的 ${uids.length} 条链接？删除后所有账号都不再使用。`)
}

async function copyShareKey(entry: PoolEntry) {
  if (!entry.shareKey)
    return
  try {
    await navigator.clipboard.writeText(entry.shareKey)
    toast.success('分享密钥已复制')
  }
  catch {
    toast.error('复制失败，请手动选择复制')
  }
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function txtLine(entry: PoolEntry) {
  const parts = [`uid=${entry.uid}`, `openid=${entry.openid}`]
  if (entry.shareSource)
    parts.push(`share_source=${entry.shareSource}`)
  if (entry.docId)
    parts.push(`doc_id=${entry.docId}`)
  if (entry.shareKey)
    parts.push(`share_key=${entry.shareKey}`)
  return parts.join('&')
}

/** 导出当前筛选结果：txt 为 share.txt 兼容行，json 与「本次新采卡片」同构 */
function exportFiltered() {
  const rows = filtered.value
  const list = exportFormat.value === 'txt'
    ? rows.filter(entry => entry.shareKey)
    : rows
  if (list.length === 0) {
    toast.error('没有可导出的条目')
    return
  }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  if (exportFormat.value === 'txt') {
    download(`friend-pool-${stamp}.txt`, `${list.map(txtLine).join('\n')}\n`, 'text/plain;charset=utf-8')
    toast.success(`已导出 ${list.length} 条链接（txt）`)
    return
  }
  const data = list.map(entry => ({
    uid: entry.uid,
    openid: entry.openid,
    share_source: entry.shareSource || '',
    shareSource: entry.shareSource || '',
    doc_id: entry.docId || '',
    docId: entry.docId || '',
    share_key: entry.shareKey || '',
    shareKey: entry.shareKey || '',
    name: entry.name || '',
    level: entry.level || null,
    at: entry.cardTime || formatTime(entry.firstSeenAt),
  }))
  const payload = {
    total: data.length,
    note: `好友号池导出（${new Date().toLocaleString('zh-CN', { hour12: false })}）`,
    data,
  }
  download(`friend-cards-${stamp}.json`, `${JSON.stringify(payload, null, 1)}\n`, 'application/json;charset=utf-8')
  toast.success(`已导出 ${data.length} 条卡片（json）`)
}

function pickAccountId() {
  if (selectedAccountIds.value.length > 0)
    return String(selectedAccountIds.value[0])
  if (accountStore.currentAccountId)
    return String(accountStore.currentAccountId)
  return wxAccounts.value[0] ? String(wxAccounts.value[0].id) : ''
}

const statusAccountId = computed(() => pickAccountId())

const LEVEL_CHUNK_SIZE = 10

/** 读取等级：对勾选条目（未勾选则对当前筛选结果）做 Enter → Leave，写回昵称/等级。分批读，避免一次太多超时 */
async function fetchLevels() {
  if (fetchingLevels.value) {
    // 再按一次就停：当前这一批会跑完，后面的不再发
    levelFetchCancelled.value = true
    toast.info('正在停止读取，当前这一批读完后停止')
    return
  }
  if (running.value)
    return
  const accountId = pickAccountId()
  if (!accountId) {
    toast.error('先在下面选一个执行账号，再读取等级')
    return
  }
  const uids = selected.value.length > 0
    ? [...selected.value]
    : filtered.value.filter(entry => entry.shareKey).map(entry => entry.uid)
  if (uids.length === 0) {
    toast.error('没有可读取等级的条目（需要 share_key）')
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
      const res = await api.post('/api/admin/friend-pool/fetch-levels', {
        accountId,
        uids: chunk,
        delayMs: 300,
      }, { timeout: 180000, skipErrorToast: true } as any)
      if (!res.data?.ok) {
        toast.error(res.data?.error || '读取等级失败')
        break
      }
      const data = res.data.data || {}
      okCount += Number(data.ok) || 0
      failedCount += Number(data.failed) || 0
      closedCount += Number(data.visitClosed) || 0
      const failed = (data.results || []).filter((row: any) => !row.ok)
      if (!firstError && failed.length > 0)
        firstError = failed[0]?.error || '未知原因'
    }
    const otherFailed = Math.max(0, failedCount - closedCount)
    const summary = `成功 ${okCount} 条${closedCount > 0 ? `，拜访关闭 ${closedCount} 条` : ''}${otherFailed > 0 ? `，其他失败 ${otherFailed} 条` : ''}`
    if (levelFetchCancelled.value)
      toast.info(`已停止读取：${summary}`)
    else
      toast.success(`读取完成：${summary}`)
    if (otherFailed > 0 && firstError)
      toast.warning(`有 ${otherFailed} 条没读到等级：${firstError}`)
    await load()
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || error?.message || '读取等级失败')
  }
  finally {
    fetchingLevels.value = false
    levelFetchCancelled.value = false
  }
}

async function doImport() {
  const text = importText.value.trim()
  if (!text) {
    toast.error('先粘贴分享链接或卡片 JSON')
    return
  }
  if (importing.value)
    return
  importing.value = true
  try {
    const res = await api.post('/api/admin/friend-pool/import', { text }, { timeout: 60000 })
    if (res.data?.ok) {
      const data = res.data.data || {}
      toast.success(`导入完成：新增 ${data.added || 0} 条，更新 ${data.updated || 0} 条${data.removed > 0 ? `，去重删除 ${data.removed} 条` : ''}`)
      importText.value = ''
      await load()
    }
    else {
      toast.error(res.data?.error || '导入失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '导入失败')
  }
  finally {
    importing.value = false
  }
}

const fileInput = ref<HTMLInputElement | null>(null)

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files && input.files[0]
  if (!file)
    return
  if (file.size > 4 * 1024 * 1024) {
    toast.error('文件太大了（超过 4 MB），请拆分后再导入')
    input.value = ''
    return
  }
  try {
    importText.value = await file.text()
    toast.info(`已读取 ${file.name}，点「导入号池」写入`)
  }
  catch {
    toast.error('读取文件失败')
  }
  finally {
    input.value = ''
  }
}

function openFilePicker() {
  fileInput.value?.click()
}

// ===== 采集器（自动导入） =====
interface AutoImportEntry {
  name: string
  url: string
  enabled: boolean
  createdAt: number
  lastHeartbeatAt: number
  lastImportAt: number
  importTotal: number
  status: 'never' | 'online' | 'offline'
}

interface AutoImportRecord {
  id: string
  ts: number
  source: string
  uid: string
  openid: string
  shareSource?: string
  docId?: string
  shareKey: string
  raw?: string
  added: number
  updated: number
  imported: boolean
  error: string
}

const autoEntries = ref<AutoImportEntry[]>([])
const autoEntriesLoading = ref(false)
const autoRecords = ref<AutoImportRecord[]>([])
const recordsLoading = ref(false)
const recordsPage = ref(1)
const RECORDS_PAGE_SIZE = 20
const importingRecordId = ref('')
let autoEntriesTimer: ReturnType<typeof setInterval> | null = null

const statusMeta: Record<AutoImportEntry['status'], { label: string, cls: string }> = {
  online: { label: '已连接', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  offline: { label: '已断开', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  never: { label: '未连接', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
}

function formatAutoTime(ts: number) {
  if (!ts) return '--'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

async function loadAutoEntries() {
  try {
    const res = await api.get('/api/admin/auto-import/entries')
    if (res.data?.ok)
      autoEntries.value = res.data.data?.entries || []
  }
  catch {
    // 静默：状态刷新不打断主流程
  }
}

async function loadAutoRecords() {
  recordsLoading.value = true
  try {
    const res = await api.get('/api/admin/auto-import/records', { params: { limit: 300 } })
    if (res.data?.ok)
      autoRecords.value = res.data.data?.records || []
  }
  catch {
    // 静默
  }
  finally {
    recordsLoading.value = false
  }
}

/** 记录里存的完整一行（后端 raw），前端兜底再拼一次 */
function fullRecordLine(rec: AutoImportRecord): string {
  if (rec.raw) return rec.raw
  const parts = [`uid=${rec.uid}`, `openid=${rec.openid}`]
  if (rec.shareSource) parts.push(`share_source=${rec.shareSource}`)
  if (rec.docId) parts.push(`doc_id=${rec.docId}`)
  if (rec.shareKey) parts.push(`share_key=${rec.shareKey}`)
  return parts.join('&')
}

async function copyRecord(rec: AutoImportRecord) {
  const line = fullRecordLine(rec)
  try {
    await navigator.clipboard.writeText(line)
    toast.success('完整分享链接已复制，可粘贴到「导入分享链接」')
  }
  catch {
    // 回退：textarea 选中复制
    const ta = document.createElement('textarea')
    ta.value = line
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); toast.success('已复制') }
    catch { toast.warning('复制失败，请手动选中') }
    document.body.removeChild(ta)
  }
}

async function importRecord(rec: AutoImportRecord) {
  if (importingRecordId.value) return
  importingRecordId.value = rec.id
  try {
    const res = await api.post(`/api/admin/auto-import/records/${encodeURIComponent(rec.id)}/import`)
    if (res.data?.ok) {
      toast.success(`已导入：新增 ${res.data.data?.added || 0} / 更新 ${res.data.data?.updated || 0}`)
      await loadAutoRecords()
    }
    else {
      toast.error(res.data?.error || '导入失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '导入失败')
  }
  finally {
    importingRecordId.value = ''
  }
}

const pagedRecords = computed(() => {
  const start = (recordsPage.value - 1) * RECORDS_PAGE_SIZE
  return autoRecords.value.slice(start, start + RECORDS_PAGE_SIZE)
})
const recordsPageCount = computed(() => Math.max(1, Math.ceil(autoRecords.value.length / RECORDS_PAGE_SIZE)))

async function toggleAutoEntry(entry: AutoImportEntry) {
  try {
    const res = await api.post(`/api/admin/auto-import/entries/${encodeURIComponent(entry.name)}/toggle`, { enabled: !entry.enabled })
    if (res.data?.ok)
      await loadAutoEntries()
    else
      toast.error(res.data?.error || '操作失败')
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '操作失败')
  }
}

async function removeAutoEntry(entry: AutoImportEntry) {
  try {
    const res = await api.post(`/api/admin/auto-import/entries/${encodeURIComponent(entry.name)}/delete`)
    if (res.data?.ok) {
      toast.success('采集器已删除')
      await loadAutoEntries()
    }
    else {
      toast.error(res.data?.error || '删除失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '删除失败')
  }
}

async function clearAutoRecords() {
  try {
    const res = await api.post('/api/admin/auto-import/records/clear')
    if (res.data?.ok) {
      toast.success('导入记录已清空')
      recordsPage.value = 1
      await loadAutoRecords()
    }
    else {
      toast.error(res.data?.error || '清空失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '清空失败')
  }
}

onMounted(async () => {
  nowTimer = setInterval(() => { nowMs.value = Date.now() }, 60000)
  await loadAutoEntries()
  await loadAutoRecords()
  autoEntriesTimer = setInterval(() => { loadAutoEntries(); loadAutoRecords() }, 30000)
  if (accountStore.accounts.length === 0)
    await accountStore.fetchAccounts()
  if (accountStore.accounts.length === 0)
    await accountStore.fetchAccounts()
  const current = String(accountStore.currentAccountId || '')
  const currentAccount = wxAccounts.value.find(acc => String(acc.id) === current)
  if (selectedAccountIds.value.length === 0 && currentAccount)
    selectedAccountIds.value = [String(currentAccount.id)]
  await load()
})

onBeforeUnmount(() => {
  if (nowTimer) clearInterval(nowTimer)
  if (autoEntriesTimer) clearInterval(autoEntriesTimer)
})
</script>

<template>
  <div class="space-y-3">
    <!-- 概览 -->
    <div class="grid grid-cols-2 gap-3 md:grid-cols-6">
      <div class="ui-card rounded-xl p-3">
        <div class="text-xs text-gray-500">
          链接总数
        </div>
        <div class="mt-1 text-2xl font-semibold">
          {{ summary.total }}
        </div>
      </div>
      <div class="ui-card rounded-xl p-3">
        <div class="text-xs text-gray-500">
          有分享密钥
        </div>
        <div class="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">
          {{ summary.withKey }}
        </div>
      </div>
      <div class="ui-card rounded-xl p-3">
        <div class="text-xs text-gray-500">
          正常
        </div>
        <div class="mt-1 text-2xl font-semibold text-blue-600 dark:text-blue-400">
          {{ summary.valid }}
        </div>
      </div>
      <div class="ui-card rounded-xl p-3">
        <div class="text-xs text-gray-500">
          已失效
        </div>
        <div class="mt-1 text-2xl font-semibold text-red-500 dark:text-red-400">
          {{ summary.expired }}
        </div>
      </div>
      <div class="ui-card rounded-xl p-3">
        <div class="text-xs text-gray-500">
          拜访关闭
        </div>
        <div class="mt-1 text-2xl font-semibold text-amber-600 dark:text-amber-400">
          {{ summary.visitClosed }}
        </div>
      </div>
      <div class="ui-card rounded-xl p-3">
        <div class="text-xs text-gray-500">
          已读到等级
        </div>
        <div class="mt-1 text-2xl font-semibold text-amber-600 dark:text-amber-400">
          {{ withLevelCount }}
        </div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="ui-card flex flex-wrap items-center gap-2 rounded-xl p-3">
      <BaseInput v-model="keyword" placeholder="搜索 uid / openid / 昵称 / 密钥" class="max-w-xs" />
      <div class="flex items-center gap-1">
        <button
          v-for="option in filterOptions"
          :key="option.value"
          class="rounded-lg border px-3 py-1.5 text-xs transition"
          :class="statusFilter === option.value
            ? 'border-green-400 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'"
          @click="statusFilter = option.value; page = 1"
        >
          {{ option.label }}
        </button>
      </div>
      <select
        v-model="levelFilter"
        class="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
      >
        <option v-for="option in levelOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <div class="flex-1" />
      <BaseButton variant="secondary" size="sm" :loading="loading" @click="load">
        刷新
      </BaseButton>
      <BaseButton variant="secondary" size="sm" :loading="fetchingLevels" :disabled="running" @click="fetchLevels">
        <div class="i-carbon-growth mr-1" />
        {{ fetchingLevels ? '停止读取' : '读取等级' }}
      </BaseButton>
      <select
        v-model="exportFormat"
        class="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
      >
        <option value="txt">
          导出 txt
        </option>
        <option value="json">
          导出 json
        </option>
      </select>
      <BaseButton variant="secondary" size="sm" @click="exportFiltered">
        <div class="i-carbon-download mr-1" />
        导出
      </BaseButton>
      <BaseButton variant="danger" size="sm" :disabled="selected.length === 0" :loading="saving" @click="removeSelected">
        <div class="i-carbon-trash-can mr-1" />
        删除选中（{{ selected.length }}）
      </BaseButton>
    </div>

    <PoolReadStatus class="mt-2" :account-id="statusAccountId" />

    <!-- 列表 -->
    <div class="ui-card overflow-hidden rounded-xl">
      <div class="custom-scrollbar max-h-[26rem] overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 text-xs text-gray-500 dark:text-gray-400" style="background: var(--surface-2);">
            <tr>
              <th class="w-10 px-3 py-2.5">
                <input
                  ref="allCheckboxRef"
                  type="checkbox"
                  :checked="allSelected"
                  :title="`全选/取消全部 ${filtered.length} 条筛选结果`"
                  @change="toggleAll"
                >
              </th>
              <th class="px-3 py-2.5 font-medium">
                uid
              </th>
              <th class="px-3 py-2.5 font-medium">
                昵称
              </th>
              <th class="px-3 py-2.5 font-medium">
                等级
              </th>
              <th class="px-3 py-2.5 font-medium">
                分享密钥
              </th>
              <th class="px-3 py-2.5 font-medium">
                状态
              </th>
              <th class="px-3 py-2.5 font-medium">
                上次读取时间
              </th>
              <th class="w-16 px-3 py-2.5 text-right font-medium">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="paged.length === 0">
              <td colspan="8" class="px-3 py-8 text-center text-gray-400">
                {{ loading ? '加载中…' : '没有符合条件的链接，先在下面导入' }}
              </td>
            </tr>
            <tr
              v-for="entry in paged"
              :key="entry.uid"
              class="border-t"
              style="border-color: var(--surface-border);"
            >
              <td class="px-3 py-2.5">
                <input type="checkbox" :checked="selected.includes(entry.uid)" @change="toggleOne(entry.uid)">
              </td>
              <td class="px-3 py-2.5 font-mono text-xs">
                {{ entry.uid }}
              </td>
              <td class="px-3 py-2.5">
                <div class="text-xs">
                  {{ entry.name || '未知' }}
                </div>
                <div class="text-[11px] text-gray-400 font-mono">
                  {{ shortOpenid(entry.openid) }}
                </div>
              </td>
              <td class="px-3 py-2.5 text-xs" :class="entry.level ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400'">
                {{ entry.level ? `Lv.${entry.level}` : '未读取' }}
              </td>
              <td class="px-3 py-2.5">
                <button
                  v-if="entry.shareKey"
                  class="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-mono text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                  :title="entry.shareKey"
                  @click="copyShareKey(entry)"
                >
                  {{ entry.shareKey.slice(0, 8) }}…
                </button>
                <span v-else class="text-[11px] text-gray-400">无</span>
              </td>
              <td class="px-3 py-2.5">
                <span
                  class="rounded px-1.5 py-0.5 text-[11px] font-medium"
                  :class="statusClass(entry)"
                  :title="statusTitle(entry)"
                >
                  {{ statusLabel(entry) }}
                </span>
              </td>
              <td class="px-3 py-2.5 text-xs text-gray-500">
                {{ lastReadAt(entry) ? formatTime(lastReadAt(entry)) : '未读取' }}
                <div class="text-[10px] text-gray-400">
                  {{ readCooldownText(entry) }}
                </div>
              </td>
              <td class="px-3 py-2.5 text-right">
                <button
                  class="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="从号池删除"
                  @click="removeOne(entry)"
                >
                  <div class="i-carbon-trash-can" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="filtered.length > PAGE_SIZE" class="flex items-center justify-between border-t px-3 py-2 text-xs text-gray-500" style="border-color: var(--surface-border);">
        <span class="flex items-center gap-2">
          共 {{ filtered.length }} 条
          <template v-if="selected.length > 0">
            · 已选 {{ selected.length }} 条
            <button class="cursor-pointer text-blue-600 hover:underline" @click="selectNone">清空选择</button>
          </template>
        </span>
        <div class="flex items-center gap-2">
          <BaseButton variant="secondary" size="sm" :disabled="page <= 1" @click="page--">
            上一页
          </BaseButton>
          <span>{{ page }} / {{ pageCount }}</span>
          <BaseButton variant="secondary" size="sm" :disabled="page >= pageCount" @click="page++">
            下一页
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- 批量导入：放在页面最下面 -->
    <div class="ui-card rounded-xl p-3">
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <div class="i-carbon-link text-green-600" />
        <span class="text-sm font-medium">导入分享链接</span>
        <span class="text-xs text-gray-400">
          支持三种：卡片 JSON txt、整条链接行、<code>uid=..&amp;openid=..&amp;share_key=..</code> 片段；同一 uid 以最后一条为准
        </span>
        <div class="flex-1" />
        <input ref="fileInput" type="file" accept=".json,.txt,application/json,text/plain" class="hidden" @change="onFileChange">
        <BaseButton variant="secondary" size="sm" :disabled="importing" @click="openFilePicker">
          <div class="i-carbon-document-add mr-1" />
          选择文件
        </BaseButton>
      </div>
      <BaseTextarea
        v-model="importText"
        :rows="6"
        placeholder="粘贴卡片 JSON（{ &quot;data&quot;: [ { &quot;uid&quot;: ... } ] }）或链接行：
?uid=1228003122&openid=o6...&share_source=8&doc_id=49&share_key=8348db1fd01c4c11a2216dfc8a55f9a4"
      />
      <div class="mt-2 flex items-center justify-between">
        <span class="text-xs text-gray-400">导入只写入号池，不会给任何账号发好友申请。</span>
        <BaseButton variant="primary" :loading="importing" @click="doImport">
          导入号池
        </BaseButton>
      </div>
    </div>

    <!-- 采集器（自动导入）：采集器用账号密码登录本面板并实时推送 -->
    <div class="ui-card rounded-xl p-3">
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <div class="i-carbon-bolt text-amber-600" />
        <span class="text-sm font-medium">采集器</span>
        <span class="text-xs text-gray-400">采集器用账号密码登录本面板，自动上线并推送卡片</span>
        <div class="flex-1" />
        <BaseButton variant="secondary" size="sm" :loading="autoEntriesLoading" @click="loadAutoEntries">
          <div class="i-carbon-renew mr-1" />
          刷新
        </BaseButton>
      </div>

      <div v-if="autoEntries.length === 0" class="py-6 text-center text-xs text-gray-400">
        还没有采集器连接。在采集器 config.ini 里填好本面板地址 + 账号密码并启动，这里会自动出现。
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="entry in autoEntries"
          :key="entry.name"
          class="rounded-lg border border-gray-200 p-2.5 dark:border-gray-700"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ entry.name }}</span>
            <span class="rounded px-1.5 py-0.5 text-xs" :class="statusMeta[entry.status]?.cls">
              {{ statusMeta[entry.status]?.label || entry.status }}
            </span>
            <span v-if="!entry.enabled" class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-800">已停用</span>
            <div class="flex-1" />
            <BaseButton variant="ghost" size="sm" @click="toggleAutoEntry(entry)">
              {{ entry.enabled ? '停用' : '启用' }}
            </BaseButton>
            <BaseButton variant="ghost" size="sm" @click="removeAutoEntry(entry)">删除</BaseButton>
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span v-if="entry.url">地址：{{ entry.url }}</span>
            <span>最近心跳：{{ formatAutoTime(entry.lastHeartbeatAt) }}</span>
            <span>最近导入：{{ formatAutoTime(entry.lastImportAt) }}</span>
            <span>累计导入：{{ entry.importTotal }} 条</span>
          </div>
        </div>
      </div>

      <div class="mt-3 border-t border-gray-100 pt-2 dark:border-gray-800">
        <span class="text-xs text-gray-400">状态说明：已连接=90秒内有心跳 · 已断开=心跳超时 · 未连接=从未上报</span>
      </div>
    </div>

    <!-- 导入记录：采集器自动发送的信息 + 导入状态 -->
    <div class="ui-card rounded-xl p-3">
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <div class="i-carbon-document text-blue-600" />
        <span class="text-sm font-medium">导入记录</span>
        <span class="text-xs text-gray-400">采集器自动发送的信息 · 共 {{ autoRecords.length }} 条</span>
        <div class="flex-1" />
        <BaseButton variant="secondary" size="sm" :loading="recordsLoading" @click="loadAutoRecords">
          <div class="i-carbon-renew mr-1" />
          刷新
        </BaseButton>
        <BaseButton variant="ghost" size="sm" @click="clearAutoRecords">清空</BaseButton>
      </div>

      <div v-if="autoRecords.length === 0" class="py-6 text-center text-xs text-gray-400">
        暂无导入记录。采集器推送卡片后会显示在这里。
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="text-gray-500">
            <tr class="border-b border-gray-200 dark:border-gray-700">
              <th class="py-1.5 pr-2">时间</th>
              <th class="py-1.5 pr-2">采集器</th>
              <th class="py-1.5 pr-2">UID</th>
              <th class="py-1.5 pr-2">完整分享链接（可复制）</th>
              <th class="py-1.5 pr-2">结果</th>
              <th class="py-1.5 pr-2">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="rec in pagedRecords"
              :key="rec.id"
              class="border-b border-gray-100 dark:border-gray-800"
            >
              <td class="py-1.5 pr-2 whitespace-nowrap">{{ formatAutoTime(rec.ts) }}</td>
              <td class="py-1.5 pr-2 whitespace-nowrap">{{ rec.source }}</td>
              <td class="py-1.5 pr-2 font-mono">{{ rec.uid }}</td>
              <td class="py-1.5 pr-2">
                <div class="max-w-96 truncate font-mono text-gray-600" :title="fullRecordLine(rec)">{{ fullRecordLine(rec) }}</div>
              </td>
              <td class="py-1.5 pr-2 whitespace-nowrap">
                <span v-if="rec.imported" class="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-300">已导入</span>
                <span v-else class="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-300" :title="rec.error">未导入</span>
              </td>
              <td class="py-1.5 pr-2 whitespace-nowrap">
                <div class="flex items-center gap-1">
                  <BaseButton variant="ghost" size="sm" title="复制完整分享链接" @click="copyRecord(rec)">复制</BaseButton>
                  <BaseButton
                    v-if="!rec.imported"
                    variant="secondary"
                    size="sm"
                    :loading="importingRecordId === rec.id"
                    @click="importRecord(rec)"
                  >导入</BaseButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="mt-2 flex items-center justify-end gap-2 text-xs text-gray-500">
          <span>{{ recordsPage }} / {{ recordsPageCount }}</span>
          <BaseButton variant="ghost" size="sm" :disabled="recordsPage <= 1" @click="recordsPage--">上一页</BaseButton>
          <BaseButton variant="ghost" size="sm" :disabled="recordsPage >= recordsPageCount" @click="recordsPage++">下一页</BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.35);
  border-radius: 3px;
}
</style>