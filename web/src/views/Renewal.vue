<script setup lang="ts">
import type { Redemption } from '@/stores/user'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useToastStore } from '@/stores/toast'
import {
  formatExpiresAt,
  formatRemaining,

  useUserStore,
} from '@/stores/user'

const userStore = useUserStore()
const accountStore = useAccountStore()
const toast = useToastStore()
const router = useRouter()

const cardCode = ref('')
const submitting = ref(false)
const redemptions = ref<Redemption[]>([])

const accounts = computed(() => accountStore.accounts)
const unlimited = computed(() => userStore.accountLimit < 0)
const accountUsed = computed(() => accounts.value.length)
const accountRemaining = computed(() => unlimited.value ? -1 : Math.max(0, userStore.accountLimit - accountUsed.value))

async function load() {
  await Promise.all([
    accountStore.fetchAccounts(),
    userStore.fetchMyRedemptions(30).then((result) => {
      redemptions.value = result.redemptions || []
    }),
  ])
}

async function renew() {
  const code = cardCode.value.trim()
  if (!code) {
    toast.warning('请输入卡密')
    return
  }
  submitting.value = true
  try {
    const result = await userStore.renew(code)
    if (!result.ok) {
      toast.error(result.error || '核销失败')
      return
    }
    toast.success(`核销成功：${result.data?.summary || '已生效'}`)
    cardCode.value = ''
    await userStore.fetchUserInfo()
    await load()
  }
  finally {
    submitting.value = false
  }
}

function goSettings() {
  router.push('/settings')
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- 有效期概览 -->
    <div class="ui-card-elevated rounded-2xl p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-lg text-gray-900 font-bold dark:text-gray-100">
            我的账户
          </h1>
          <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {{ userStore.username }} ·
            {{ userStore.isAdmin ? '管理员（不限额度、永久有效）' : '普通用户' }}
          </p>
        </div>
        <span
          class="rounded-full px-3 py-1 text-xs font-medium"
          :class="userStore.isExpired
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'"
        >
          {{ userStore.isExpired ? '已过期' : '有效' }}
        </span>
      </div>

      <div class="grid mt-4 gap-3 sm:grid-cols-3">
        <div class="rounded-xl p-3" style="background: var(--surface-2);">
          <div class="text-xs text-gray-500">
            到期时间
          </div>
          <div class="mt-1 text-sm text-gray-900 font-semibold dark:text-gray-100">
            {{ formatExpiresAt(userStore.subscription) }}
          </div>
        </div>
        <div class="rounded-xl p-3" style="background: var(--surface-2);">
          <div class="text-xs text-gray-500">
            剩余时长
          </div>
          <div class="mt-1 text-sm text-gray-900 font-semibold dark:text-gray-100">
            {{ formatRemaining(userStore.subscription?.isPermanent ? null : userStore.subscription?.expiresAt ? userStore.subscription.expiresAt - Date.now() : 0) }}
          </div>
        </div>
        <div class="rounded-xl p-3" style="background: var(--surface-2);">
          <div class="text-xs text-gray-500">
            农场账号额度
          </div>
          <div class="mt-1 text-sm text-gray-900 font-semibold dark:text-gray-100">
            {{ unlimited ? `${accountUsed} / 不限` : `${accountUsed} / ${userStore.accountLimit}（剩余 ${accountRemaining}）` }}
          </div>
        </div>
      </div>
    </div>

    <!-- 续费 -->
    <div class="ui-card rounded-xl p-4">
      <h2 class="mb-3 flex items-center gap-2 text-sm text-gray-900 font-semibold dark:text-gray-100">
        <div class="i-carbon-gift" />
        卡密续费
      </h2>
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="cardCode"
          placeholder="输入卡密，加时卡延长有效期、额度卡提升账号配额"
          class="focus:border-primary min-w-56 flex-1 border rounded-xl px-3 py-2.5 text-sm font-mono outline-none"
          style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);"
          @keyup.enter="renew"
        >
        <button
          class="bg-gradient-primary rounded-xl px-4 py-2.5 text-sm text-white font-semibold disabled:opacity-50 hover:opacity-90"
          :disabled="submitting"
          @click="renew"
        >
          {{ submitting ? '核销中…' : '立即核销' }}
        </button>
      </div>
      <p class="mt-2 text-[11px] text-gray-400">
        加时卡在未过期时会顺延有效期；已过期则从当前时间重新起算。永久卡优先级最高。
      </p>
    </div>

    <!-- 我的农场账号 -->
    <div class="ui-card rounded-xl p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="flex items-center gap-2 text-sm text-gray-900 font-semibold dark:text-gray-100">
          <div class="i-carbon-user-multiple" />
          我的农场账号
        </h2>
        <button class="text-primary text-xs hover:underline" @click="goSettings">
          去配置自动化 / 掉线提醒 →
        </button>
      </div>
      <div v-if="accounts.length === 0" class="py-6 text-center text-sm text-gray-400">
        暂无农场账号，请在概览页或账号菜单中添加
      </div>
      <div v-else class="grid gap-2 sm:grid-cols-2">
        <div
          v-for="account in accounts"
          :key="account.id"
          class="flex items-center justify-between border rounded-xl px-3 py-2.5"
          style="border-color: var(--surface-border);"
        >
          <div class="min-w-0">
            <div class="truncate text-sm text-gray-900 font-medium dark:text-gray-100">
              {{ account.name || account.nick || `账号 ${account.id}` }}
            </div>
            <div class="text-[11px] text-gray-400">
              ID {{ account.id }} · {{ account.platform || '-' }}
            </div>
          </div>
          <button class="text-primary text-xs hover:underline" @click="goSettings">
            配置
          </button>
        </div>
      </div>
    </div>

    <!-- 核销记录 -->
    <div class="ui-card rounded-xl p-4">
      <h2 class="mb-3 flex items-center gap-2 text-sm text-gray-900 font-semibold dark:text-gray-100">
        <div class="i-carbon-receipt" />
        我的核销记录
      </h2>
      <div v-if="redemptions.length === 0" class="py-5 text-center text-sm text-gray-400">
        暂无记录
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="item in redemptions"
          :key="item.id"
          class="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs last:border-0"
          style="border-color: var(--surface-border);"
        >
          <span class="font-mono">{{ item.code }}</span>
          <span class="text-gray-500">
            {{ item.cardType === 'quota' ? '额度卡' : '加时卡' }} · {{ item.summary }}
          </span>
          <span class="text-gray-400">{{ new Date(item.at).toLocaleString('zh-CN', { hour12: false }) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
