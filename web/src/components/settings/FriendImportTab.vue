<script setup lang="ts">
import { computed, onMounted } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import { useAccountStore } from '@/stores/account'
import {
  allowUnknownLevel,
  cancelled,
  delayMs,
  minLevel,
  progress,
  rawText,
  results,
  running,
  selectedAccountIds,
} from '@/stores/friend-import'
import { useToastStore } from '@/stores/toast'

interface InviteItem {
  uid: string
  openid: string
  shareSource: string
  shareKey: string
}

// 单次请求条数：worker 内每条间隔默认 2s，10 条约 20s，避免 HTTP 超时
const CHUNK_SIZE = 10

const accountStore = useAccountStore()
const toast = useToastStore()

const delayOptions = [
  { label: '1 秒', value: 1000 },
  { label: '2 秒（推荐）', value: 2000 },
  { label: '3 秒', value: 3000 },
  { label: '5 秒', value: 5000 },
]

const wxAccounts = computed(() =>
  accountStore.accounts.filter(acc => ['wx', 'wechat'].includes(String(acc.platform || '').toLowerCase())),
)

const allWxSelected = computed(
  () => wxAccounts.value.length > 0 && selectedAccountIds.value.length === wxAccounts.value.length,
)

function cleanLine(line: string) {
  return line
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .trim()
}

/** 支持三种粘贴形式：完整 URL / `?uid=..&..` / 纯参数串 */
function parseLine(line: string): InviteItem | null {
  const text = cleanLine(line)
  if (!text)
    return null
  const queryIndex = text.indexOf('?')
  const query = queryIndex >= 0 ? text.slice(queryIndex + 1) : text
  if (!query.includes('uid=') || !query.includes('openid='))
    return null

  let params: URLSearchParams
  try {
    params = new URLSearchParams(query)
  }
  catch {
    return null
  }
  const uid = (params.get('uid') || '').trim()
  const openid = (params.get('openid') || '').trim()
  if (!uid || !openid)
    return null
  return {
    uid,
    openid,
    shareSource: (params.get('share_source') || '').trim(),
    shareKey: (params.get('share_key') || '').trim(),
  }
}

const parseSummary = computed(() => {
  const seen = new Set<string>()
  const items: InviteItem[] = []
  let invalid = 0
  let duplicated = 0

  for (const line of rawText.value.split(/\r?\n/)) {
    if (!cleanLine(line))
      continue
    const item = parseLine(line)
    if (!item) {
      invalid++
      continue
    }
    if (seen.has(item.uid)) {
      duplicated++
      continue
    }
    seen.add(item.uid)
    items.push(item)
  }
  return { items, invalid, duplicated }
})

const parsedItems = computed(() => parseSummary.value.items)

const itemsWithoutKey = computed(() => parsedItems.value.filter(item => !item.shareKey).length)

const summary = computed(() => ({
  success: results.value.filter(r => r.ok).length,
  skipped: results.value.filter(r => r.skipped).length,
  existing: results.value.filter(r => r.existing).length,
  failed: results.value.filter(r => !r.ok && !r.skipped).length,
}))

const progressPercent = computed(() => {
  if (progress.value.total <= 0)
    return 0
  return Math.min(100, Math.round((progress.value.done / progress.value.total) * 100))
})

function toggleAccount(id: string) {
  if (running.value)
    return
  const index = selectedAccountIds.value.indexOf(id)
  if (index >= 0)
    selectedAccountIds.value.splice(index, 1)
  else
    selectedAccountIds.value.push(id)
}

function toggleAllAccounts() {
  if (running.value)
    return
  selectedAccountIds.value = allWxSelected.value ? [] : wxAccounts.value.map(acc => String(acc.id))
}

function resetResults() {
  results.value = []
  progress.value = { done: 0, total: 0 }
}

async function start() {
  if (running.value)
    return
  const items = parsedItems.value
  if (items.length === 0) {
    toast.error('没有解析到有效链接，请检查粘贴内容')
    return
  }
  const accounts = wxAccounts.value.filter(acc => selectedAccountIds.value.includes(String(acc.id)))
  if (accounts.length === 0) {
    toast.error('请先选择要执行的微信账号')
    return
  }

  running.value = true
  cancelled.value = false
  resetResults()
  progress.value = { done: 0, total: items.length * accounts.length }

  try {
    for (const acc of accounts) {
      for (let offset = 0; offset < items.length; offset += CHUNK_SIZE) {
        if (cancelled.value)
          break
        const chunk = items.slice(offset, offset + CHUNK_SIZE)
        try {
          const res = await api.post('/api/friends/apply-invites', {
            items: chunk,
            delayMs: delayMs.value,
            minLevel: Number(minLevel.value) || 0,
            allowUnknownLevel: allowUnknownLevel.value,
          }, {
            headers: { 'x-account-id': String(acc.id) },
            timeout: 180000,
            skipErrorToast: true,
          } as any)

          const data = res.data?.data || {}
          const list = Array.isArray(data.results) ? data.results : []
          if (list.length === 0) {
            // 后端未返回明细时按整块成功处理
            for (const item of chunk)
              results.value.push({ accountId: String(acc.id), accountName: acc.name, uid: item.uid, ok: true })
          }
          else {
            for (const row of list) {
              results.value.push({
                accountId: String(acc.id),
                accountName: acc.name,
                uid: String(row.uid || ''),
                ok: row.ok === true,
                skipped: row.skipped === true,
                existing: row.existing === true,
                level: row.level == null ? null : Number(row.level),
                name: row.name || '',
                error: row.ok === true ? undefined : (row.error || '未知错误'),
              })
            }
          }
        }
        catch (error: any) {
          const message = error?.response?.data?.error || error?.message || '请求失败'
          for (const item of chunk) {
            results.value.push({
              accountId: String(acc.id),
              accountName: acc.name,
              uid: item.uid,
              ok: false,
              error: message,
            })
          }
        }
        progress.value.done += chunk.length
      }
      if (cancelled.value)
        break
    }
  }
  finally {
    running.value = false
    if (cancelled.value)
      toast.warning('已中止，剩余链接未提交')
    else if (summary.value.skipped > 0) {
      const existingTip = summary.value.existing > 0 ? `（其中已是好友 ${summary.value.existing}）` : ''
      toast.success(`处理完成：成功 ${summary.value.success}，跳过 ${summary.value.skipped}${existingTip}，失败 ${summary.value.failed}`)
    }
    else
      toast.success(`处理完成：成功 ${summary.value.success}，失败 ${summary.value.failed}`)
  }
}

function stop() {
  if (!running.value)
    return
  cancelled.value = true
}

function clearAll() {
  if (running.value)
    return
  rawText.value = ''
  resetResults()
}

onMounted(async () => {
  if (accountStore.accounts.length === 0)
    await accountStore.fetchAccounts()
  if (selectedAccountIds.value.length > 0)
    return
  const current = String(accountStore.currentAccountId || '')
  const currentAccount = wxAccounts.value.find(acc => String(acc.id) === current)
  if (currentAccount)
    selectedAccountIds.value = [String(currentAccount.id)]
  else if (wxAccounts.value[0])
    selectedAccountIds.value = [String(wxAccounts.value[0].id)]
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
          批量加好友
        </h3>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          粘贴微信群里的分享链接（一行一条），自动解析 uid / openid / share_source / share_key，按账号批量发送好友申请；可按对方农场等级过滤。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <BaseButton variant="secondary" size="sm" :disabled="running" @click="clearAll">
          清空
        </BaseButton>
        <BaseButton
          v-if="running"
          variant="danger"
          size="sm"
          @click="stop"
        >
          中止
        </BaseButton>
        <BaseButton
          v-else
          size="sm"
          :loading="false"
          :disabled="parsedItems.length === 0 || selectedAccountIds.length === 0"
          @click="start"
        >
          开始添加（{{ parsedItems.length }} 条）
        </BaseButton>
      </div>
    </div>

    <!-- 链接输入 -->
    <div class="border border-gray-200 rounded-lg bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-2 flex items-center justify-between">
        <h4 class="flex items-center gap-2 text-base text-gray-900 font-bold dark:text-gray-100">
          <div class="i-carbon-link" />
          分享链接
        </h4>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          支持整条链接或 <code class="rounded bg-gray-100 px-1 dark:bg-gray-700">?uid=..&openid=..&share_key=..</code>
        </span>
      </div>
      <BaseTextarea
        v-model="rawText"
        :rows="7"
        :disabled="running"
        placeholder="一行一条，例如：&#10;?uid=1229668033&openid=oL61MvrdwIozmNS2oC1XXgQ2_RpY&share_source=8&doc_id=0&share_key=8bdbc191021840fc989f755844ce7cfd"
      />
      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>有效 <b class="text-emerald-600 dark:text-emerald-400">{{ parsedItems.length }}</b> 条</span>
        <span v-if="parseSummary.duplicated > 0">重复已去重 {{ parseSummary.duplicated }} 条</span>
        <span v-if="parseSummary.invalid > 0" class="text-amber-600 dark:text-amber-400">
          无法解析 {{ parseSummary.invalid }} 条
        </span>
      </div>
    </div>

    <!-- 账号与节奏 -->
    <div class="border border-gray-200 rounded-lg bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-3 flex items-center justify-between">
        <h4 class="flex items-center gap-2 text-base text-gray-900 font-bold dark:text-gray-100">
          <div class="i-carbon-user-multiple" />
          执行账号
        </h4>
        <button
          v-if="wxAccounts.length > 0"
          type="button"
          class="text-xs text-[var(--theme-primary)] hover:underline disabled:opacity-50"
          :disabled="running"
          @click="toggleAllAccounts"
        >
          {{ allWxSelected ? '取消全选' : '全选' }}
        </button>
      </div>

      <div v-if="wxAccounts.length === 0" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
        没有可用的微信账号。该功能仅微信账号支持（通过分享链接调 ReportArkClick 加好友）。
      </div>
      <div v-else class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <button
          v-for="acc in wxAccounts"
          :key="acc.id"
          type="button"
          class="flex items-center gap-2 border rounded-lg px-3 py-2 text-left text-sm transition-colors"
          :class="selectedAccountIds.includes(String(acc.id))
            ? 'border-transparent'
            : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'"
          :style="selectedAccountIds.includes(String(acc.id))
            ? { borderColor: 'var(--theme-primary)', backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' }
            : {}"
          :disabled="running"
          @click="toggleAccount(String(acc.id))"
        >
          <span
            class="h-3.5 w-3.5 shrink-0 border rounded-sm"
            :style="selectedAccountIds.includes(String(acc.id))
              ? { borderColor: 'var(--theme-primary)', backgroundColor: 'var(--theme-primary)' }
              : { borderColor: 'currentColor', opacity: 0.5 }"
          />
          <span class="min-w-0 flex-1 truncate">{{ acc.name || acc.nick || acc.id }}</span>
          <span v-if="acc.running === false" class="shrink-0 text-[10px] text-gray-400">未运行</span>
        </button>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <span class="text-sm text-gray-700 font-medium dark:text-gray-300">每条间隔</span>
        <div class="w-40">
          <BaseSelect v-model="delayMs" :options="delayOptions" :disabled="running" />
        </div>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          间隔太短可能被服务端限流，建议 2 秒
        </span>
      </div>

      <div class="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700/60">
        <div class="flex flex-wrap items-end gap-3">
          <div class="w-44">
            <BaseInput
              v-model.number="minLevel"
              label="农场等级下限"
              type="number"
              min="0"
              max="200"
              :disabled="running"
            />
          </div>
          <span class="pb-2 text-xs text-gray-500 dark:text-gray-400">
            0 = 不筛选；&gt;0 时先读对方农场等级，低于该值不发送申请
          </span>
        </div>
        <label class="mt-2 flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input
            v-model="allowUnknownLevel"
            type="checkbox"
            class="accent-[var(--theme-primary)]"
            :disabled="running || !(Number(minLevel) > 0)"
          >
          等级查不到时仍然添加（比如 share_key 已过期）
        </label>
        <p class="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
          执行前会先与当前账号的好友列表比对，已是好友的直接跳过；执行期间农场 / 牧场自动化任务会暂停，全部提交完成后自动恢复。
        </p>
        <p class="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
          筛选会在对方农场做一次「进入 → 退出」以读取等级，不偷取、不操作任何地块。
          <span v-if="Number(minLevel) > 0 && itemsWithoutKey > 0" class="text-amber-600 dark:text-amber-400">
            当前有 {{ itemsWithoutKey }} 条链接缺少 share_key，筛选时会读取不到等级。
          </span>
        </p>
      </div>
    </div>

    <!-- 进度与结果 -->
    <div
      v-if="progress.total > 0"
      class="border border-gray-200 rounded-lg bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 class="flex items-center gap-2 text-base text-gray-900 font-bold dark:text-gray-100">
          <div class="i-carbon-chart-line" />
          执行结果
        </h4>
        <div class="flex items-center gap-3 text-xs">
          <span class="text-emerald-600 dark:text-emerald-400">成功 {{ summary.success }}</span>
          <span v-if="summary.skipped > 0" class="text-amber-600 dark:text-amber-400">跳过 {{ summary.skipped }}</span>
          <span v-if="summary.existing > 0" class="text-gray-600 dark:text-gray-300">已是好友 {{ summary.existing }}</span>
          <span class="text-red-600 dark:text-red-400">失败 {{ summary.failed }}</span>
          <span class="text-gray-500 dark:text-gray-400">{{ progress.done }} / {{ progress.total }}</span>
        </div>
      </div>

      <div class="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          class="h-full rounded-full transition-all duration-300"
          :style="{ width: `${progressPercent}%`, background: 'var(--theme-gradient)' }"
        />
      </div>

      <div class="mt-3 max-h-80 overflow-auto">
        <table class="w-full text-left text-xs">
          <thead class="sticky top-0 bg-white text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            <tr>
              <th class="py-1.5 pr-2 font-medium">账号</th>
              <th class="py-1.5 pr-2 font-medium">uid</th>
              <th class="py-1.5 pr-2 font-medium">等级</th>
              <th class="py-1.5 pr-2 font-medium">结果</th>
              <th class="py-1.5 font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in results"
              :key="`${row.accountId}-${row.uid}-${index}`"
              class="border-t border-gray-100 dark:border-gray-700/60"
            >
              <td class="py-1.5 pr-2 text-gray-600 dark:text-gray-300">{{ row.accountName }}</td>
              <td class="py-1.5 pr-2 font-mono text-gray-800 dark:text-gray-200">
                {{ row.uid }}
                <span v-if="row.name" class="ml-1 font-sans text-gray-400">{{ row.name }}</span>
              </td>
              <td class="py-1.5 pr-2 text-gray-600 dark:text-gray-300">
                {{ row.level == null || row.level === 0 ? '—' : row.level }}
              </td>
              <td class="py-1.5 pr-2">
                <span
                  class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  :class="row.ok
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : row.skipped
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'"
                >
                  {{ row.ok ? '已申请' : (row.skipped ? '已跳过' : '失败') }}
                </span>
              </td>
              <td class="py-1.5 text-gray-500 dark:text-gray-400">{{ row.error || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
