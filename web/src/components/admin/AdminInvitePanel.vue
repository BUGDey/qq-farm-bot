<script setup lang="ts">
/**
 * 管理后台 · 邀请奖励
 *
 * 一个开关 + 一组规则 + 一份明细。默认关闭，开启后按规则发放时长奖励。
 */
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useToastStore } from '@/stores/toast'
import { formatEpochMinute } from '@/utils/datetime'

interface InviteSettings {
  enabled: boolean
  inviterDays: number
  inviteeDays: number
  maxInvitesPerDay: number
  maxPerIpPerDay: number
  minInviterAgeHours: number
  maxRewardDaysPerDay: number
  requireBoundAccount: boolean
  pendingExpireDays: number
}

interface InviteRecord {
  id: number
  at: number
  inviter: string
  invitee: string
  code: string
  ip: string
  status: string
  reason: string
  inviterDays: number
  pendingDays: number
  inviteeDays: number
}

interface Overview {
  settings: InviteSettings
  stats: {
    total: number
    granted: number
    pending: number
    rejected: number
    grantedDays: number
    rejectedByReason: Record<string, number>
    topInviters: { username: string, days: number }[]
  }
  records: InviteRecord[]
}

const toast = useToastStore()
const data = ref<Overview | null>(null)
const form = ref<InviteSettings | null>(null)
const loading = ref(false)
const saving = ref(false)
const filter = ref<'all' | 'granted' | 'pending' | 'rejected'>('all')

const reasonText: Record<string, string> = {
  self_invite: '自己邀自己',
  invitee_already_used: '该新号已被邀请过',
  inviter_too_new: '邀请人注册未满 24 小时',
  inviter_daily_limit: '邀请人当天次数超限',
  ip_daily_limit: '同 IP 当天次数超限',
  inviter_reward_cap: '邀请人当天奖励天数已封顶',
  code_not_found: '邀请码不存在',
  disabled: '奖励未开启',
  inviter_disabled: '邀请人账号被禁用',
  inviter_missing: '邀请人不存在',
  empty: '未填邀请码',
}

const statusText: Record<string, string> = {
  granted: '已结算',
  pending: '待绑定账号',
  rejected: '拦截',
  expired: '已过期',
}

const shownRecords = computed(() => {
  const records = data.value?.records || []
  if (filter.value === 'all')
    return records
  return records.filter(item => item.status === filter.value)
})

async function load() {
  loading.value = true
  try {
    const res = await api.get('/api/admin/invite/overview')
    if (res.data?.ok) {
      data.value = res.data.data as Overview
      form.value = { ...data.value.settings }
    }
    else {
      toast.error(res.data?.error || '读取邀请配置失败')
    }
  }
  catch {
    toast.error('读取邀请配置失败')
  }
  finally {
    loading.value = false
  }
}

async function save() {
  if (!form.value || saving.value)
    return
  saving.value = true
  try {
    const res = await api.post('/api/admin/invite/settings', form.value)
    if (res.data?.ok) {
      toast.success(form.value.enabled ? '邀请奖励已开启' : '邀请奖励已关闭')
      await load()
    }
    else {
      toast.error(res.data?.error || '保存失败')
    }
  }
  catch {
    toast.error('保存失败')
  }
  finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="space-y-4">
    <div class="ui-card p-5">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="flex items-center gap-2 text-base text-gray-900 font-semibold">
            <div class="i-carbon-user-follow text-lg text-emerald-500" />
            邀请奖励
          </h3>
          <p class="mt-1 text-xs text-gray-500 leading-relaxed">
            邀请码<b>永远可选</b>，用户不填照样注册；开启后才发放时长奖励。
            默认要求被邀请人<b>绑定挂机账号</b>才结算邀请人的奖励，这是批量注册小号拿不到的好处。
          </p>
        </div>
        <BaseButton :loading="saving" @click="save">
          保存设置
        </BaseButton>
      </header>

      <div v-if="loading || !form" class="py-8 text-center text-sm text-gray-400">
        正在加载…
      </div>

      <template v-else>
        <BaseSwitch v-model="form.enabled" label="启用邀请奖励" />

        <div class="grid mt-4 gap-3 lg:grid-cols-3 sm:grid-cols-2">
          <label class="text-xs text-gray-500">
            邀请人获得天数
            <input v-model.number="form.inviterDays" type="number" min="0" max="3650" class="mt-1 w-full border rounded-lg px-2.5 py-1.5 text-sm" style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);">
          </label>
          <label class="text-xs text-gray-500">
            被邀请人获得天数
            <input v-model.number="form.inviteeDays" type="number" min="0" max="3650" class="mt-1 w-full border rounded-lg px-2.5 py-1.5 text-sm" style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);">
          </label>
          <label class="text-xs text-gray-500">
            单人每天最多邀请
            <input v-model.number="form.maxInvitesPerDay" type="number" min="0" max="200" class="mt-1 w-full border rounded-lg px-2.5 py-1.5 text-sm" style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);">
          </label>
          <label class="text-xs text-gray-500">
            同 IP 每天最多计入
            <input v-model.number="form.maxPerIpPerDay" type="number" min="0" max="200" class="mt-1 w-full border rounded-lg px-2.5 py-1.5 text-sm" style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);">
          </label>
          <label class="text-xs text-gray-500">
            邀请人最小账号年龄（小时）
            <input v-model.number="form.minInviterAgeHours" type="number" min="0" max="8760" class="mt-1 w-full border rounded-lg px-2.5 py-1.5 text-sm" style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);">
          </label>
          <label class="text-xs text-gray-500">
            单人每天最多拿多少天
            <input v-model.number="form.maxRewardDaysPerDay" type="number" min="0" max="3650" class="mt-1 w-full border rounded-lg px-2.5 py-1.5 text-sm" style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);">
          </label>
          <label class="text-xs text-gray-500">
            待定奖励保留（天）
            <input v-model.number="form.pendingExpireDays" type="number" min="1" max="365" class="mt-1 w-full border rounded-lg px-2.5 py-1.5 text-sm" style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);">
          </label>
        </div>

        <div class="mt-3">
          <BaseSwitch v-model="form.requireBoundAccount" label="被邀请人绑定挂机账号后才给邀请人结算（推荐）" />
        </div>
      </template>
    </div>

    <div v-if="data" class="ui-card p-5">
      <h3 class="mb-3 flex items-center gap-2 text-base text-gray-900 font-semibold">
        <div class="i-carbon-chart-line text-lg text-emerald-500" />
        数据
      </h3>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div class="border rounded-lg py-2 text-center" style="border-color: var(--surface-border);">
          <div class="text-lg font-semibold">
            {{ data.stats.total }}
          </div>
          <div class="text-[11px] text-gray-400">
            总记录
          </div>
        </div>
        <div class="border rounded-lg py-2 text-center" style="border-color: var(--surface-border);">
          <div class="text-lg text-emerald-600 font-semibold">
            {{ data.stats.granted }}
          </div>
          <div class="text-[11px] text-gray-400">
            已结算
          </div>
        </div>
        <div class="border rounded-lg py-2 text-center" style="border-color: var(--surface-border);">
          <div class="text-lg text-amber-600 font-semibold">
            {{ data.stats.pending }}
          </div>
          <div class="text-[11px] text-gray-400">
            待绑定
          </div>
        </div>
        <div class="border rounded-lg py-2 text-center" style="border-color: var(--surface-border);">
          <div class="text-lg text-rose-600 font-semibold">
            {{ data.stats.rejected }}
          </div>
          <div class="text-[11px] text-gray-400">
            已拦截
          </div>
        </div>
      </div>

      <div v-if="Object.keys(data.stats.rejectedByReason).length" class="mt-3 text-xs text-gray-500">
        拦截原因：
        <span v-for="(count, reason) in data.stats.rejectedByReason" :key="reason" class="mr-2">
          {{ reasonText[reason] || reason }} ×{{ count }}
        </span>
      </div>

      <div v-if="data.stats.topInviters.length" class="mt-2 text-xs text-gray-500">
        累计奖励最多：
        <span v-for="item in data.stats.topInviters" :key="item.username" class="mr-2">
          {{ item.username }} {{ item.days }} 天
        </span>
      </div>
    </div>

    <div v-if="data" class="ui-card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style="border-color: var(--surface-border);">
        <h3 class="text-sm text-gray-900 font-semibold">
          邀请明细
        </h3>
        <div class="flex gap-1 text-xs">
          <button
            v-for="item in [{ key: 'all', label: '全部' }, { key: 'granted', label: '已结算' }, { key: 'pending', label: '待绑定' }, { key: 'rejected', label: '拦截' }]"
            :key="item.key"
            class="rounded-full px-2.5 py-1 transition"
            :class="filter === item.key ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:bg-gray-100'"
            @click="filter = item.key as never"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <div v-if="shownRecords.length === 0" class="py-8 text-center text-sm text-gray-400">
        暂无记录
      </div>

      <table v-else class="w-full text-left text-sm">
        <thead class="text-xs text-gray-500" style="background: var(--surface-muted);">
          <tr>
            <th class="px-4 py-2 font-medium">
              时间
            </th>
            <th class="px-4 py-2 font-medium">
              邀请人
            </th>
            <th class="px-4 py-2 font-medium">
              新账号
            </th>
            <th class="px-4 py-2 font-medium">
              状态
            </th>
            <th class="px-4 py-2 font-medium">
              奖励
            </th>
            <th class="px-4 py-2 font-medium">
              IP
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in shownRecords" :key="item.id" class="border-t" style="border-color: var(--surface-border);">
            <td class="whitespace-nowrap px-4 py-2 text-xs text-gray-500">
              {{ formatEpochMinute(item.at) }}
            </td>
            <td class="px-4 py-2">
              {{ item.inviter || '-' }}
            </td>
            <td class="px-4 py-2">
              {{ item.invitee }}
            </td>
            <td class="px-4 py-2">
              <span
                class="rounded-full px-2 py-0.5 text-[11px]"
                :class="item.status === 'granted'
                  ? 'bg-emerald-50 text-emerald-600'
                  : item.status === 'pending'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-rose-50 text-rose-600'"
              >
                {{ statusText[item.status] || item.status }}
              </span>
              <span v-if="item.reason && item.status === 'rejected'" class="ml-1 text-[11px] text-gray-400">
                {{ reasonText[item.reason] || item.reason }}
              </span>
            </td>
            <td class="px-4 py-2 text-xs">
              <template v-if="item.status === 'granted'">
                +{{ item.inviterDays }} 天
              </template>
              <template v-else-if="item.status === 'pending'">
                待结 {{ item.pendingDays }} 天
              </template>
              <template v-else>
                -
              </template>
            </td>
            <td class="px-4 py-2 text-xs text-gray-400">
              {{ item.ip || '-' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
