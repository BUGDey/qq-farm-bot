<script setup lang="ts">
import type { Card } from '@/stores/user'
import { computed, onMounted, ref } from 'vue'
import { useToastStore } from '@/stores/toast'
import {
  cardStatusText,
  formatCardValue,
  useUserStore,
} from '@/stores/user'

const userStore = useUserStore()
const toast = useToastStore()

const cards = ref<Card[]>([])
const loading = ref(false)
const stats = ref<any>(null)
const selected = ref<string[]>([])

const filter = ref({ type: '', status: '', keyword: '' })

const showCreateModal = ref(false)
const createForm = ref({
  description: '',
  type: 'time' as 'time' | 'quota',
  durationValue: 3,
  durationUnit: 'day' as 'day' | 'hour' | 'week' | 'month' | 'year' | 'permanent',
  value: 1,
  isPermanent: false,
  count: 1,
})
const creating = ref(false)
const lastBatch = ref<Card[]>([])

const isPermanentUnit = computed(() => createForm.value.durationUnit === 'permanent' || createForm.value.isPermanent)

function openCreateModal() {
  lastBatch.value = []
  showCreateModal.value = true
}

function closeCreateModal() {
  showCreateModal.value = false
}

const filteredCards = computed(() => cards.value)

async function load() {
  loading.value = true
  try {
    cards.value = await userStore.fetchCards({
      type: filter.value.type || undefined,
      status: filter.value.status || undefined,
      keyword: filter.value.keyword || undefined,
    })
    stats.value = await userStore.fetchCardStats()
  }
  finally {
    loading.value = false
  }
}

async function submitCreate() {
  creating.value = true
  try {
    const payload: Record<string, any> = {
      description: createForm.value.description.trim(),
      type: createForm.value.type,
      count: createForm.value.count,
    }
    if (createForm.value.type === 'quota') {
      payload.value = createForm.value.value
    }
    else if (isPermanentUnit.value) {
      payload.isPermanent = true
      payload.days = -1
    }
    else {
      payload.durationValue = createForm.value.durationValue
      payload.durationUnit = createForm.value.durationUnit
    }
    const result = await userStore.createCard(payload)
    if (!result.ok) {
      toast.error(result.error || '生成失败')
      return
    }
    lastBatch.value = result.data || []
    toast.success(`已生成 ${lastBatch.value.length} 张卡密`)
    await load()
  }
  finally {
    creating.value = false
  }
}

async function copyText(text: string, successTip = '卡密已复制到剪贴板') {
  const value = String(text ?? '')
  if (!value) {
    toast.warning('没有可复制的内容')
    return
  }

  let copied = false
  // 仅在安全上下文（https / localhost）下使用 Clipboard API
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      copied = true
    }
    catch {}
  }
  // 兜底：HTTP 或局域网 IP 访问时 Clipboard API 不可用，走 execCommand
  if (!copied) {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.top = '0'
      textarea.style.left = '0'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      textarea.setSelectionRange(0, value.length)
      copied = document.execCommand('copy')
      textarea.remove()
    }
    catch {}
  }

  if (copied)
    toast.success(successTip)
  else
    toast.error('复制失败，请手动选择')
}

async function copyCodes(list: Card[]) {
  if (list.length === 0)
    return
  await copyText(list.map(c => c.code).join('\n'))
}

/** 批量导出为 txt：创建时间 / 卡密内容 / 卡密类型 */
function exportBatchTxt(list: Card[]) {
  if (list.length === 0) {
    toast.warning('没有可导出的卡密')
    return
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const lines = list.map(card =>
    `${formatTime(card.createdAt)}\t${card.code}\t${card.type === 'quota' ? '额度卡' : '加时卡'}`,
  )
  const content = ['创建时间\t卡密内容\t卡密类型', ...lines].join('\r\n')
  // 加 BOM，避免 Windows 记事本 / Excel 打开乱码
  const blob = new Blob([`\ufeff${content}`], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `卡密导出_${formatTime(Date.now()).replace(/[-: ]/g, '')}.txt`
  a.click()
  URL.revokeObjectURL(url)
  toast.success(`已导出 ${list.length} 张卡密`)
}

async function toggleCard(card: Card, action: 'revoke' | 'enable' | 'disable') {
  const payload = action === 'revoke'
    ? { revoked: true }
    : { enabled: action === 'enable', revoked: false }
  const result = await userStore.updateCard(card.code, payload)
  if (!result.ok) {
    toast.error(result.error || '操作失败')
    return
  }
  toast.success(action === 'revoke' ? '卡密已作废' : action === 'enable' ? '卡密已启用' : '卡密已禁用')
  await load()
}

async function removeCard(card: Card) {
  if (!window.confirm(`确认删除卡密 ${card.code}？`))
    return
  const result = await userStore.deleteCard(card.code)
  if (!result.ok) {
    toast.error(result.error || '删除失败')
    return
  }
  toast.success('卡密已删除')
  await load()
}

async function removeSelected() {
  if (selected.value.length === 0) {
    toast.warning('请先选择要删除的卡密')
    return
  }
  if (!window.confirm(`确认删除选中的 ${selected.value.length} 张卡密？`))
    return
  const result = await userStore.deleteCardsBatch(selected.value)
  if (!result.ok) {
    toast.error(result.error || '批量删除失败')
    return
  }
  toast.success(`已删除 ${result.data?.deletedCount || 0} 张卡密`)
  selected.value = []
  await load()
}

function toggleSelect(code: string) {
  const index = selected.value.indexOf(code)
  if (index === -1)
    selected.value.push(code)
  else selected.value.splice(index, 1)
}

function statusClass(status: string) {
  if (status === 'used')
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (status === 'unused')
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  if (status === 'revoked')
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
}

onMounted(load)
defineExpose({ load })
</script>

<template>
  <div class="space-y-4">
    <!-- 过滤与批量操作 -->
    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="filter.keyword"
        placeholder="搜索卡密 / 描述 / 使用者"
        class="min-w-48 flex-1 border rounded-xl px-3 py-2 text-sm outline-none"
        style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);"
        @keyup.enter="load"
      >
      <select v-model="filter.type" class="form-select" @change="load">
        <option value="">
          全部类型
        </option>
        <option value="time">
          加时卡
        </option>
        <option value="quota">
          额度卡
        </option>
      </select>
      <select v-model="filter.status" class="form-select" @change="load">
        <option value="">
          全部状态
        </option>
        <option value="unused">
          未使用
        </option>
        <option value="used">
          已使用
        </option>
        <option value="disabled">
          已禁用
        </option>
        <option value="revoked">
          已作废
        </option>
      </select>
      <button class="btn-ghost" @click="load">
        <div class="i-carbon-renew" :class="{ 'animate-spin': loading }" />
        刷新
      </button>
      <button class="btn-primary-sm" @click="openCreateModal">
        <div class="i-carbon-add-alt mr-1 inline-block align-[-2px]" />
        生成卡密
      </button>
      <button
        class="flex items-center gap-1.5 border border-red-300 rounded-xl px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:hover:bg-red-900/20"
        @click="removeSelected"
      >
        <div class="i-carbon-trash-can" />
        批量删除（{{ selected.length }}）
      </button>
    </div>

    <div v-if="stats" class="text-xs text-gray-400">
      库存：共 {{ stats.total }} 张（未使用 {{ stats.unused }} / 已使用 {{ stats.used }} / 已作废 {{ stats.revoked }}）
    </div>

    <!-- 卡密列表 -->
    <div class="ui-card overflow-hidden rounded-xl">
      <div class="custom-scrollbar max-h-[26rem] overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 text-xs text-gray-500 dark:text-gray-400" style="background: var(--surface-2);">
            <tr>
              <th class="w-10 px-3 py-2.5" />
              <th class="px-3 py-2.5 font-medium">
                卡密
              </th>
              <th class="px-3 py-2.5 font-medium">
                描述
              </th>
              <th class="px-3 py-2.5 font-medium">
                类型 / 面值
              </th>
              <th class="px-3 py-2.5 font-medium">
                状态
              </th>
              <th class="px-3 py-2.5 font-medium">
                使用者
              </th>
              <th class="px-3 py-2.5 text-right font-medium">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredCards.length === 0">
              <td colspan="7" class="px-3 py-8 text-center text-gray-400">
                暂无卡密
              </td>
            </tr>
            <tr
              v-for="card in filteredCards"
              :key="card.code"
              class="border-t"
              style="border-color: var(--surface-border);"
            >
              <td class="px-3 py-2.5">
                <input
                  type="checkbox"
                  class="accent-primary"
                  :checked="selected.includes(card.code)"
                  @change="toggleSelect(card.code)"
                >
              </td>
              <td class="px-3 py-2.5">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-mono">{{ card.code }}</span>
                  <button
                    class="icon-btn !h-6 !w-6"
                    title="复制卡密"
                    @click="copyText(card.code)"
                  >
                    <div class="i-carbon-copy text-xs" />
                  </button>
                </div>
              </td>
              <td class="max-w-40 truncate px-3 py-2.5 text-xs text-gray-500" :title="card.description">
                {{ card.description || '-' }}
              </td>
              <td class="px-3 py-2.5 text-xs">
                <span class="rounded px-1.5 py-0.5 text-[10px] font-medium" :class="card.type === 'quota' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'">
                  {{ card.type === 'quota' ? '额度卡' : '加时卡' }}
                </span>
                <span class="ml-1.5">{{ formatCardValue(card) }}</span>
              </td>
              <td class="px-3 py-2.5">
                <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(card.status)">
                  {{ cardStatusText(card.status) }}
                </span>
              </td>
              <td class="px-3 py-2.5 text-xs text-gray-500">
                {{ card.usedBy || '-' }}
              </td>
              <td class="px-3 py-2.5">
                <div class="flex items-center justify-end gap-1">
                  <button
                    v-if="card.status !== 'revoked'"
                    class="icon-btn"
                    title="作废"
                    @click="toggleCard(card, 'revoke')"
                  >
                    <div class="i-carbon-misuse" />
                  </button>
                  <button
                    class="icon-btn"
                    :title="card.enabled ? '禁用' : '启用'"
                    @click="toggleCard(card, card.enabled ? 'disable' : 'enable')"
                  >
                    <div :class="card.enabled ? 'i-carbon-pause' : 'i-carbon-play'" />
                  </button>
                  <button class="icon-btn icon-btn-danger" title="删除" @click="removeCard(card)">
                    <div class="i-carbon-trash-can" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 生成卡密弹窗 -->
    <Teleport to="body">
      <div
        v-if="showCreateModal"
        class="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4"
        @click.self="closeCreateModal"
      >
        <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800" style="background: var(--surface-1);">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="flex items-center gap-2 text-base text-gray-900 font-semibold dark:text-gray-100">
              <div class="i-carbon-add-alt" />
              生成卡密
            </h3>
            <button class="icon-btn" title="关闭" @click="closeCreateModal">
              <div class="i-carbon-close" />
            </button>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="mb-1 block text-xs text-gray-500">卡密描述（选填）</label>
              <input v-model="createForm.description" class="form-input" placeholder="例如：3 天体验卡">
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500">类型</label>
              <select v-model="createForm.type" class="form-input" style="width: 100%;">
                <option value="time">
                  加时卡
                </option>
                <option value="quota">
                  额度卡
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500">生成数量</label>
              <input v-model.number="createForm.count" type="number" min="1" max="200" class="form-input">
            </div>
            <template v-if="createForm.type === 'time'">
              <div>
                <label class="mb-1 block text-xs text-gray-500">时长</label>
                <input
                  v-model.number="createForm.durationValue"
                  type="number"
                  min="1"
                  class="form-input"
                  :disabled="isPermanentUnit"
                >
              </div>
              <div>
                <label class="mb-1 block text-xs text-gray-500">单位</label>
                <select v-model="createForm.durationUnit" class="form-input" style="width: 100%;">
                  <option value="hour">
                    小时
                  </option>
                  <option value="day">
                    天
                  </option>
                  <option value="week">
                    周
                  </option>
                  <option value="month">
                    月
                  </option>
                  <option value="year">
                    年
                  </option>
                  <option value="permanent">
                    永久
                  </option>
                </select>
              </div>
            </template>
            <template v-else>
              <div>
                <label class="mb-1 block text-xs text-gray-500">额度数量</label>
                <input v-model.number="createForm.value" type="number" min="1" class="form-input">
              </div>
            </template>
          </div>

          <div class="mt-4 flex items-center justify-end gap-2">
            <button class="btn-ghost" @click="closeCreateModal">
              取消
            </button>
            <button class="btn-primary-sm" :disabled="creating" @click="submitCreate">
              {{ creating ? '生成中…' : '生成' }}
            </button>
          </div>

          <div v-if="lastBatch.length" class="mt-4 border rounded-xl p-3" style="border-color: var(--surface-border);">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs text-gray-500">本次生成 {{ lastBatch.length }} 张</span>
              <div class="flex items-center gap-3">
                <button class="text-primary text-xs hover:underline" @click="copyCodes(lastBatch)">
                  复制全部
                </button>
                <button class="text-primary text-xs hover:underline" @click="exportBatchTxt(lastBatch)">
                  批量导出（txt）
                </button>
              </div>
            </div>
            <div class="custom-scrollbar max-h-28 overflow-auto text-[11px] leading-relaxed font-mono">
              <div v-for="card in lastBatch" :key="card.code">
                {{ card.code }} · {{ formatCardValue(card) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  width: 28px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--muted-text);
  transition: all 0.15s;
}
.icon-btn:hover {
  background: var(--surface-2);
  color: var(--theme-primary);
}
.icon-btn-danger:hover {
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444;
}
.form-input,
.form-select {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--surface-border);
  background: var(--input-bg);
  color: var(--theme-text);
  padding: 8px 12px;
  font-size: 13px;
  outline: none;
}
.form-select {
  width: auto;
  padding: 8px 10px;
}
.form-input:focus,
.form-select:focus {
  border-color: var(--theme-primary);
}
.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 10px;
  border: 1px solid var(--surface-border);
  padding: 7px 14px;
  font-size: 13px;
  color: var(--theme-text);
}
.btn-primary-sm {
  display: inline-flex;
  align-items: center;
  border-radius: 10px;
  background: var(--theme-gradient);
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}
.btn-primary-sm:disabled {
  opacity: 0.5;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.35);
  border-radius: 3px;
}
</style>
