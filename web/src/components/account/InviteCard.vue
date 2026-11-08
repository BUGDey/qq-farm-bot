<script setup lang="ts">
/**
 * 我的邀请码
 *
 * 只展示、不推销：开关由管理员控制，关闭后这里会显示「暂未开启」，
 * 邀请码仍然可见（用户可以先攒着，开启后再用）。
 */
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import { useToastStore } from '@/stores/toast'

interface InviteRecord {
  invitee: string
  at: number
  status: 'granted' | 'pending' | 'rejected' | 'expired'
  inviterDays: number
  pendingDays: number
}

interface InviteSummary {
  enabled: boolean
  code: string
  inviterDays: number
  inviteeDays: number
  requireBoundAccount: boolean
  invitedCount: number
  grantedCount: number
  pendingCount: number
  earnedDays: number
  records: InviteRecord[]
}

const toast = useToastStore()
const data = ref<InviteSummary | null>(null)
const loading = ref(false)

const statusText: Record<string, string> = {
  granted: '已结算',
  pending: '待绑定账号',
  rejected: '未生效',
  expired: '已过期',
}

function formatDate(at: number) {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function load() {
  loading.value = true
  try {
    const res = await api.get('/api/user/invite', { skipErrorToast: true } as never)
    if (res.data?.ok)
      data.value = res.data.data as InviteSummary
  }
  catch {
    data.value = null
  }
  finally {
    loading.value = false
  }
}

async function copyCode() {
  const code = data.value?.code
  if (!code)
    return
  try {
    await navigator.clipboard.writeText(code)
    toast.success('邀请码已复制')
  }
  catch {
    toast.warning(`复制失败，请手动记录：${code}`)
  }
}

const shareText = computed(() => {
  const d = data.value
  if (!d)
    return ''
  return `注册时填邀请码 ${d.code}，我们双方都能加时长${d.requireBoundAccount ? '（绑定一个挂机账号后双方一起到账）' : ''}。`
})

async function copyShare() {
  try {
    await navigator.clipboard.writeText(shareText.value)
    toast.success('邀请文案已复制，直接发给朋友即可')
  }
  catch {
    toast.warning('复制失败，请手动复制')
  }
}

onMounted(load)
</script>

<template>
  <div class="ui-card rounded-xl p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="flex items-center gap-2 text-sm text-gray-900 font-semibold dark:text-gray-100">
        <div class="i-carbon-user-follow" />
        邀请好友
      </h2>
      <span
        v-if="data"
        class="rounded-full px-2 py-0.5 text-[11px]"
        :class="data.enabled
          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'"
      >
        {{ data.enabled ? '奖励进行中' : '暂未开启' }}
      </span>
    </div>

    <div v-if="loading" class="py-6 text-center text-sm text-gray-400">
      加载中…
    </div>

    <div v-else-if="!data" class="py-6 text-center text-sm text-gray-400">
      邀请信息获取失败，稍后再试
    </div>

    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <button
          class="text-primary border rounded-lg bg-gray-50 px-3 py-1.5 text-sm tracking-wider font-mono transition dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
          style="border-color: var(--surface-border);"
          title="点击复制邀请码"
          @click="copyCode"
        >
          {{ data.code }}
        </button>
        <button
          class="border rounded-lg px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
          style="border-color: var(--surface-border);"
          @click="copyShare"
        >
          <div class="i-carbon-share mr-1 inline-block align-[-2px]" />
          复制邀请文案
        </button>
      </div>

      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="border rounded-lg py-2" style="border-color: var(--surface-border);">
          <div class="text-lg text-gray-900 font-semibold dark:text-gray-100">
            {{ data.invitedCount }}
          </div>
          <div class="text-[11px] text-gray-400">
            已邀请
          </div>
        </div>
        <div class="border rounded-lg py-2" style="border-color: var(--surface-border);">
          <div class="text-lg text-gray-900 font-semibold dark:text-gray-100">
            {{ data.grantedCount }}
          </div>
          <div class="text-[11px] text-gray-400">
            已结算
          </div>
        </div>
        <div class="border rounded-lg py-2" style="border-color: var(--surface-border);">
          <div class="text-primary text-lg font-semibold">
            {{ data.earnedDays }} 天
          </div>
          <div class="text-[11px] text-gray-400">
            累计获得
          </div>
        </div>
      </div>

      <p class="mt-3 text-[11px] text-gray-400 leading-relaxed">
        <template v-if="data.enabled">
          每邀请 1 位好友注册，你得 <b class="text-gray-600 dark:text-gray-300">{{ data.inviterDays }} 天</b>、
          对方得 <b class="text-gray-600 dark:text-gray-300">{{ data.inviteeDays }} 天</b>。
          <template v-if="data.requireBoundAccount">
            对方<b>绑定一个挂机账号</b>后，你和他各自的时长才会一起到账 —— 这是防止批量注册空号的闸门；同一个挂机账号只能给一个账号带来奖励，拿小号绑同一个游戏号不会再加时长。
          </template>
        </template>
        <template v-else>
          管理员暂未开启邀请奖励，邀请码先收好，开启后补用同样有效。
        </template>
      </p>

      <div v-if="data.records.length > 0" class="mt-3 border-t pt-2" style="border-color: var(--surface-border);">
        <div class="mb-1 text-[11px] text-gray-400">
          最近邀请
        </div>
        <div
          v-for="(item, index) in data.records"
          :key="`${item.invitee}-${index}`"
          class="flex items-center justify-between py-1 text-xs"
        >
          <span class="truncate text-gray-700 dark:text-gray-200">{{ item.invitee }}</span>
          <span class="ml-2 shrink-0 text-[11px] text-gray-400">
            {{ statusText[item.status] || item.status }}
            <template v-if="item.status === 'granted'"> +{{ item.inviterDays }} 天</template>
            <template v-else-if="item.status === 'pending'"> 待结 {{ item.pendingDays }} 天</template>
            · {{ formatDate(item.at) }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
