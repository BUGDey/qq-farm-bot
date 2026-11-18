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
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'
import { ranchLogBelongs } from '@/utils/ranch-display'
import { compactRuntimeLogs, matchesRuntimeLog, normalizeRuntimeLog } from '@/utils/runtime-log'

const props = withDefaults(defineProps<{ scene?: 'farm' | 'ranch' }>(), { scene: 'farm' })
const statusStore = useStatusStore()
const accountStore = useAccountStore()
const toastStore = useToastStore()
const { logs: statusLogs, accountLogs: statusAccountLogs, realtimeConnected } = storeToRefs(statusStore)
const { currentAccountId } = storeToRefs(accountStore)
const logContainer = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const clearingLogs = ref(false)
const refreshingLogs = ref(false)
const pendingLogCount = ref(0)
const logScrollStates = new Map<string, { top: number, atBottom: boolean }>()

const scope = ref<'scene' | 'all'>('all')
const filter = reactive({
  module: '',
  event: '',
  keyword: '',
  level: '',
})

const hasActiveLogFilter = computed(() =>
  !!(filter.module || filter.event || filter.keyword || filter.level),
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
  return (scope.value === 'all' || ranchLogBelongs(log, props.scene)) && matchesRuntimeLog(log, filter)
}))

const visibleLogs = computed(() => compactRuntimeLogs(filteredLogs.value))

const modules = [
  { label: '全部模块', value: '' },
  { label: '农场', value: 'farm' },
  { label: '牧场', value: 'ranch' },
  { label: '好友', value: 'friend' },
  { label: '仓库', value: 'warehouse' },
  { label: '商城', value: 'shop' },
  { label: '任务', value: 'task' },
  { label: '活动', value: 'activity' },
  { label: '宠物', value: 'pet' },
  { label: '场景调度', value: 'scene' },
  { label: '系统', value: 'system' },
]

const events = [
  ...Object.entries({ friendProduce: '帮好友生产', produce: '开始生产', collect: '收集产物', harvest: '收获动物', clean: '清理灾害', place: '放入幼崽', addFeed: '补充牧草', submitOrder: '提交订单', refreshOrder: '刷新订单', claimIllustrated: '图鉴领奖', claimWeight: '重量积分领奖', buy: '购买商品', exchange: '兑换商品', sell: '出售牧场产物', useCan: '装填罐头', feedAnimal: '使用罐头容器', steal: '偷取好友产物', help: '帮助清理', stroke: '照料好友动物', putHazard: '放蚊子', upgradeBuilding: '升级设施', completeUpgrade: '完成设施升级', leaveFriend: '退出好友牧场', automation: '牧场自动任务' }).map(([value, label]) => ({ value, label })),
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

function getEventLabel(event: string) {
  return eventLabelMap[event] || event
}

function getLogTagClass(tag: string) {
  if (tag === '错误')
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (tag === '系统')
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (tag === '农场')
    return 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300'
  if (tag === '牧场')
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
  if (tag === '好友')
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
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

function onLogFilterChange() {
  pendingLogCount.value = 0
  restoreLogScroll()
}

function onLogSearchTrigger() {
  pendingLogCount.value = 0
  restoreLogScroll()
}

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
    const { data } = await api.delete('/api/logs', { headers: { 'x-account-id': currentAccountId.value } })
    if (data?.ok) {
      toastStore.success('日志已清空')
      statusStore.logs = []
      statusStore.accountLogs = []
      await refreshRuntimeLogs()
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

async function syncLogs() {
  if (!currentAccountId.value || document.hidden)
    return
  statusStore.setRealtimeLogsEnabled(true)
  statusStore.connectRealtime(currentAccountId.value)
  await Promise.all([statusStore.fetchLogs(currentAccountId.value, { limit: 300 }), statusStore.fetchAccountLogs(currentAccountId.value, 300)])
}
watch(currentAccountId, () => {
  statusStore.logs = []
  statusStore.accountLogs = []
  void syncLogs()
  scrollToBottom()
})
onMounted(syncLogs)
useIntervalFn(() => {
  if (!realtimeConnected.value)
    void syncLogs()
}, 10000)
</script>

<template>
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
        <BaseSelect v-model="scope" :options="[{ label: '当前场景与系统', value: 'scene' }, { label: '全部场景', value: 'all' }]" class="w-40" />
        <BaseSelect v-model="filter.level" :options="[{ label: '全部级别', value: '' }, { label: '信息', value: 'info' }, { label: '警告', value: 'warn' }, { label: '错误', value: 'error' }]" class="w-28" />
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
          @click="Object.assign(filter, { module: '', event: '', keyword: '', level: '' }); onLogFilterChange()"
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
          清空账号日志
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
          {{ hasActiveLogFilter ? '可以调整或重置筛选条件。' : '运行账号后显示全部场景操作及账号连接记录。' }}
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
</template>
