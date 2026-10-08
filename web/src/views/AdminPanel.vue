<script setup lang="ts">
import type { LoginLog, Redemption } from '@/stores/user'
import { onMounted, ref, watch } from 'vue'
import AdminCardPanel from '@/components/admin/AdminCardPanel.vue'
import AdminUserPanel from '@/components/admin/AdminUserPanel.vue'
import { useToastStore } from '@/stores/toast'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const toast = useToastStore()

type TabKey = 'users' | 'cards' | 'redemptions' | 'logs'
const tab = ref<TabKey>('users')
const tabs: { key: TabKey, label: string, icon: string }[] = [
  { key: 'users', label: '用户管理', icon: 'i-carbon-user-multiple' },
  { key: 'cards', label: '卡密管理', icon: 'i-carbon-purchase' },
  { key: 'redemptions', label: '核销流水', icon: 'i-carbon-receipt' },
  { key: 'logs', label: '登录日志', icon: 'i-carbon-document' },
]

const redemptions = ref<Redemption[]>([])
const logs = ref<LoginLog[]>([])
const loading = ref(false)

async function loadRedemptions() {
  loading.value = true
  try {
    const result = await userStore.fetchRedemptions({ limit: 200 })
    redemptions.value = result.redemptions || []
  }
  finally {
    loading.value = false
  }
}

async function loadLogs() {
  loading.value = true
  try {
    const result = await userStore.fetchLoginLogs({ limit: 200 })
    logs.value = result.logs || []
  }
  finally {
    loading.value = false
  }
}

async function clearLogs() {
  if (!window.confirm('确认清空全部登录日志？'))
    return
  const result = await userStore.clearLoginLogs()
  if (!result.ok) {
    toast.error(result.error || '清空失败')
    return
  }
  toast.success('登录日志已清空')
  await loadLogs()
}

function formatTime(ts: number | null | undefined) {
  if (!ts)
    return '-'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function actionText(action: string) {
  if (action === 'register')
    return { text: '注册激活', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' }
  if (action === 'revoke')
    return { text: '卡密作废', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' }
  return { text: '续费核销', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' }
}

/** 登录日志事件中文名（后端存的是英文标识，展示层统一翻译；未识别的原样显示） */
const LOGIN_EVENT_LABELS: Record<string, string> = {
  login_success: '登录成功',
  login_failed: '登录失败',
  login_rejected: '登录拒绝',
  register_success: '注册成功',
  register_failed: '注册失败',
}

/** 登录日志错误类型中文名 */
const LOGIN_ERROR_LABELS: Record<string, string> = {
  invalid_credentials: '用户名或密码错误',
  rate_limit: '尝试过于频繁',
  locked: '已临时锁定',
  disabled: '账号已禁用',
  expired: '账号已过期',
  invalid_card: '卡密无效',
}

function loginEventText(event: string) {
  return LOGIN_EVENT_LABELS[event] || event
}

function loginErrorText(errorType?: string | null) {
  if (!errorType)
    return ''
  return LOGIN_ERROR_LABELS[errorType] || errorType
}

watch(tab, (value) => {
  if (value === 'redemptions')
    loadRedemptions()
  if (value === 'logs')
    loadLogs()
})

onMounted(() => {
  if (!userStore.isAdmin)
    toast.warning('仅管理员可访问后台数据')
})
</script>

<template>
  <div class="space-y-4">
    <!-- 头部 -->
    <div class="ui-card-elevated flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <div>
        <h1 class="flex items-center gap-2 text-lg text-gray-900 font-bold dark:text-gray-100">
          <div class="i-carbon-user-admin text-lg" style="color: var(--theme-primary);" />
          管理后台
        </h1>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          当前登录：{{ userStore.username }} · {{ userStore.isSuperAdmin ? '超级管理员' : '管理员' }}
        </p>
      </div>
    </div>

    <!-- Tab -->
    <div class="flex flex-wrap gap-1 rounded-xl p-1" style="background: var(--surface-2);">
      <button
        v-for="item in tabs"
        :key="item.key"
        class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all"
        :class="tab === item.key
          ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
        @click="tab = item.key"
      >
        <div :class="item.icon" />
        {{ item.label }}
      </button>
    </div>

    <AdminUserPanel v-if="tab === 'users'" />
    <AdminCardPanel v-else-if="tab === 'cards'" />

    <!-- 核销流水 -->
    <div v-else-if="tab === 'redemptions'" class="ui-card overflow-hidden rounded-xl">
      <div class="custom-scrollbar max-h-[32rem] overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 text-xs text-gray-500 dark:text-gray-400" style="background: var(--surface-2);">
            <tr>
              <th class="px-3 py-2.5 font-medium">
                时间
              </th>
              <th class="px-3 py-2.5 font-medium">
                用户
              </th>
              <th class="px-3 py-2.5 font-medium">
                动作
              </th>
              <th class="px-3 py-2.5 font-medium">
                卡密
              </th>
              <th class="px-3 py-2.5 font-medium">
                变更
              </th>
              <th class="px-3 py-2.5 font-medium">
                操作人
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="redemptions.length === 0">
              <td colspan="6" class="px-3 py-8 text-center text-gray-400">
                {{ loading ? '加载中…' : '暂无核销记录' }}
              </td>
            </tr>
            <tr
              v-for="item in redemptions"
              :key="item.id"
              class="border-t"
              style="border-color: var(--surface-border);"
            >
              <td class="px-3 py-2.5 text-xs text-gray-500">
                {{ formatTime(item.at) }}
              </td>
              <td class="px-3 py-2.5 text-xs font-medium">
                {{ item.username || '-' }}
              </td>
              <td class="px-3 py-2.5">
                <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="actionText(item.action).cls">
                  {{ actionText(item.action).text }}
                </span>
                <span class="ml-1.5 text-[11px] text-gray-400">
                  {{ item.cardType === 'quota' ? '额度卡' : '加时卡' }}
                </span>
              </td>
              <td class="px-3 py-2.5 text-[11px] font-mono">
                {{ item.code }}
              </td>
              <td class="px-3 py-2.5 text-[11px] text-gray-500">
                {{ item.summary }}
              </td>
              <td class="px-3 py-2.5 text-xs text-gray-500">
                {{ item.operator || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 登录日志 -->
    <div v-else class="ui-card overflow-hidden rounded-xl">
      <div class="flex items-center justify-between p-3">
        <span class="text-sm text-gray-600 dark:text-gray-300">最近 {{ logs.length }} 条</span>
        <button
          class="flex items-center gap-1.5 border border-red-300 rounded-lg px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          @click="clearLogs"
        >
          <div class="i-carbon-trash-can" />
          清空日志
        </button>
      </div>
      <div class="custom-scrollbar max-h-[30rem] overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 text-xs text-gray-500 dark:text-gray-400" style="background: var(--surface-2);">
            <tr>
              <th class="px-3 py-2.5 font-medium">
                时间
              </th>
              <th class="px-3 py-2.5 font-medium">
                事件
              </th>
              <th class="px-3 py-2.5 font-medium">
                用户
              </th>
              <th class="px-3 py-2.5 font-medium">
                IP
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="logs.length === 0">
              <td colspan="4" class="px-3 py-8 text-center text-gray-400">
                {{ loading ? '加载中…' : '暂无日志' }}
              </td>
            </tr>
            <tr
              v-for="log in logs"
              :key="log.id"
              class="border-t"
              style="border-color: var(--surface-border);"
            >
              <td class="px-3 py-2.5 text-xs text-gray-500">
                {{ formatTime(log.timestamp) }}
              </td>
              <td class="px-3 py-2.5">
                <span
                  class="rounded px-1.5 py-0.5 text-[11px] font-medium"
                  :class="log.event.includes('failed') || log.event.includes('rejected')
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'"
                >
                  {{ loginEventText(log.event) }}
                </span>
                <span v-if="log.errorType" class="ml-1.5 text-[11px] text-gray-400">{{ loginErrorText(log.errorType) }}</span>
              </td>
              <td class="px-3 py-2.5 text-xs">
                {{ log.username || '-' }}
              </td>
              <td class="px-3 py-2.5 text-[11px] text-gray-500 font-mono">
                {{ log.ip }}
              </td>
            </tr>
          </tbody>
        </table>
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
