<script setup lang="ts">
import type { QingmeiActivity } from '@/stores/activity'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountStore } from '@/stores/account'
import { useActivityStore } from '@/stores/activity'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{ activity?: QingmeiActivity | null, loading?: boolean }>()
const emit = defineEmits<{ refresh: [] }>()

const T = {
  title: '青酿换万金',
  subtitle: '每日领取青梅种子，攒够青梅后精酿售卖换取金币',
  claimTitle: '每日领种',
  claimHint: '每天可领取一次青梅种子',
  claim: '领取种子',
  claimed: '今日已领取',
  claimClosed: '领种已结束',
  brewTitle: '精酿售卖',
  brewHint: '自动全选背包中的普通青梅（单次最多 30 堆），一次性精酿并售卖，可分享翻倍',
  brew: '精酿并售卖',
  brewDisabled: '青梅不足',
  brewClosed: '酿造已结束',
  materialUnit: '当前青梅',
  lastResult: '最近一次售卖',
  wineType: '酒型',
  quote: '报价',
  gold: '金币收益',
  shared: '已分享翻倍',
  notShared: '未翻倍',
  consumed: '消耗青梅',
  needAccount: '请先选择账号',
}

const accounts = useAccountStore()
const activityStore = useActivityStore()
const toast = useToastStore()
const { currentAccountId } = storeToRefs(accounts)
const { qingmeiClaimLoading, qingmeiSellLoading } = storeToRefs(activityStore)

interface SoldResult {
  gold: number
  price: number
  wineType: number
  consumedCount: number
  shared: boolean
}

const lastResult = ref<SoldResult | null>(null)

const activity = computed(() => props.activity || null)
const busy = computed(() => qingmeiClaimLoading.value || qingmeiSellLoading.value)
const materialCount = computed(() => Number(activity.value?.material?.itemCount || 0))
const claimable = computed(() => activity.value?.claimable === true)
const claimed = computed(() => activity.value?.claimed === true)
const claimActive = computed(() => activity.value?.claimActive !== false)
const wineActive = computed(() => activity.value?.wineActive !== false)
const canBrew = computed(() => wineActive.value && materialCount.value > 0)

function formatTime(value?: number) {
  const raw = Number(value || 0)
  if (!raw)
    return '-'
  const date = new Date(raw > 1000000000000 ? raw : raw * 1000)
  if (Number.isNaN(date.getTime()))
    return '-'
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

function claimLabel() {
  if (!claimActive.value)
    return T.claimClosed
  return claimed.value ? T.claimed : T.claim
}

function brewLabel() {
  if (!wineActive.value)
    return T.brewClosed
  return materialCount.value > 0 ? T.brew : T.brewDisabled
}

async function run(action: 'claim' | 'brew') {
  const accountId = currentAccountId.value
  if (!accountId) {
    toast.error(T.needAccount)
    return
  }
  try {
    if (action === 'claim') {
      const data = await activityStore.claimQingmeiSeeds(accountId)
      if (data?.alreadyClaimed)
        toast.info(T.claimed)
      else
        toast.success(`${T.claim}成功`)
    }
    else {
      const data = await activityStore.brewAndSellQingmeiWine(accountId)
      if (data?.ok === false) {
        toast.error(String(data.error || '青梅酿售卖失败'))
      }
      else {
        lastResult.value = {
          gold: Number(data?.sell?.gold || 0),
          price: Number(data?.brew?.price || 0),
          wineType: Number(data?.brew?.wineType || 0),
          consumedCount: Number(data?.consumedCount || 0),
          shared: data?.share?.shared === true,
        }
        toast.success(`${T.brew}成功`)
      }
    }
    emit('refresh')
  }
  catch (err: any) {
    toast.error(err?.response?.data?.error || err?.message || '操作失败')
  }
}
</script>

<template>
  <section class="rounded-lg bg-white shadow-sm dark:bg-gray-800">
    <div class="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
      <div class="min-w-0 flex items-center gap-3">
        <div class="h-10 w-10 flex flex-none items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
          <span class="i-carbon-bee text-lg" />
        </div>
        <div class="min-w-0">
          <h2 class="truncate text-base text-gray-900 font-semibold dark:text-gray-100">
            {{ activity?.title || T.title }}
          </h2>
          <p class="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
            {{ T.subtitle }}
          </p>
        </div>
      </div>
      <div class="flex flex-none items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>{{ formatTime(activity?.startTime) }} — {{ formatTime(activity?.endTime) }}</span>
      </div>
    </div>

    <div v-if="!currentAccountId" class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
      {{ T.needAccount }}
    </div>

    <div v-else-if="!activity" class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
      <span v-if="loading">加载中…</span>
      <span v-else>当前账号未开放该活动</span>
    </div>

    <div v-else class="grid gap-3 p-4 lg:grid-cols-2">
      <!-- 每日领种 -->
      <div class="border border-gray-200 rounded-lg p-4 dark:border-gray-700">
        <div class="flex items-start gap-3">
          <img
            v-if="activity.reward?.image"
            :src="activity.reward.image"
            :alt="activity.reward.itemName"
            class="h-12 w-12 flex-none object-contain"
          >
          <div class="min-w-0 flex-1">
            <h3 class="text-sm text-gray-900 font-semibold dark:text-gray-100">
              {{ T.claimTitle }}
            </h3>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {{ T.claimHint }}
            </p>
            <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">
              {{ activity.reward?.itemName || '青梅种子' }} × {{ activity.reward?.itemCount || 0 }}
            </p>
          </div>
        </div>
        <BaseButton
          class="mt-3 w-full"
          :disabled="busy || !claimable"
          :loading="qingmeiClaimLoading"
          @click="run('claim')"
        >
          {{ claimLabel() }}
        </BaseButton>
      </div>

      <!-- 精酿售卖 -->
      <div class="border border-gray-200 rounded-lg p-4 dark:border-gray-700">
        <div class="flex items-start gap-3">
          <img
            v-if="activity.material?.image"
            :src="activity.material.image"
            :alt="activity.material.itemName"
            class="h-12 w-12 flex-none object-contain"
          >
          <div class="min-w-0 flex-1">
            <h3 class="text-sm text-gray-900 font-semibold dark:text-gray-100">
              {{ T.brewTitle }}
            </h3>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {{ T.brewHint }}
            </p>
            <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">
              {{ T.materialUnit }}：{{ activity.material?.itemName || '青梅' }} × {{ materialCount }}
            </p>
          </div>
        </div>
        <BaseButton
          class="mt-3 w-full"
          :disabled="busy || !canBrew"
          :loading="qingmeiSellLoading"
          @click="run('brew')"
        >
          {{ brewLabel() }}
        </BaseButton>
      </div>

      <!-- 最近一次售卖结果 -->
      <div v-if="lastResult" class="rounded-lg bg-amber-50 p-4 text-sm lg:col-span-2 dark:bg-amber-900/20">
        <h3 class="text-sm text-amber-900 font-semibold dark:text-amber-200">
          {{ T.lastResult }}
        </h3>
        <div class="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-amber-900/90 dark:text-amber-100/90">
          <span>{{ T.wineType }}：{{ lastResult.wineType }}</span>
          <span>{{ T.quote }}：{{ lastResult.price }}</span>
          <span>{{ T.gold }}：{{ lastResult.gold }}</span>
          <span>{{ T.consumed }}：{{ lastResult.consumedCount }}</span>
          <span>{{ lastResult.shared ? T.shared : T.notShared }}</span>
        </div>
      </div>

      <p v-if="activity.warning" class="text-xs text-red-500 lg:col-span-2">
        {{ activity.warning }}
      </p>
    </div>
  </section>
</template>
