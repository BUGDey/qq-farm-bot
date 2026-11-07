<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useToastStore } from '@/stores/toast'

// 「连接网关」全局开关：网关模式把游戏连接交给独立进程持有，
// 之后重启 worker（改代码）不会掉线、也不用重新扫码。
// 该配置是进程级开关，保存后需要重启面板才生效，所以卡片上明确写出这一点。

interface NetworkModeState {
  saved: 'direct' | 'gateway'
  envOverride: string
  effective: 'direct' | 'gateway'
  restartRequired: boolean
}

const toast = useToastStore()

const loading = ref(false)
const saving = ref(false)
const mode = ref<'direct' | 'gateway'>('direct')
const state = ref<NetworkModeState | null>(null)

const envOverride = computed(() => state.value?.envOverride || '')
const effective = computed(() => state.value?.effective || 'direct')
const dirty = computed(() => state.value !== null && mode.value !== state.value.saved)

const effectiveLabel = computed(() => (effective.value === 'gateway' ? '网关模式' : '直连模式'))

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/api/admin/network-mode')
    if (data?.ok && data.data) {
      state.value = data.data as NetworkModeState
      mode.value = state.value.saved
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || error?.message || '读取连接模式失败')
  }
  finally {
    loading.value = false
  }
}

async function save() {
  if (!dirty.value || saving.value)
    return
  saving.value = true
  try {
    const { data } = await api.post('/api/admin/network-mode', {
      mode: mode.value,
      confirmed: true,
    })
    if (data?.ok && data.data) {
      state.value = data.data as NetworkModeState
      toast.success(
        data.data.restartRequired
          ? '已保存，重启面板后生效'
          : '已保存',
      )
    }
    else {
      toast.error(data?.error || '保存失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || error?.message || '保存失败')
  }
  finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="border border-gray-200 rounded-lg bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
    <h4 class="mb-1 flex items-center gap-2 text-base text-gray-900 font-bold dark:text-gray-100">
      <span class="i-carbon-network-4 h-4 w-4" />
      连接网关（连接与业务分离）
      <span
        v-if="state"
        class="rounded px-2 py-0.5 text-xs font-normal"
        :class="effective === 'gateway'
          ? 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'"
      >
        当前：{{ effectiveLabel }}
      </span>
    </h4>
    <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
      开启后游戏连接由独立网关进程持有：改代码重启 worker 不会掉线、不用重新扫码；
      网关进程自己重启仍需重新抓码。网络假死会自动「先让路、再判死」，不会急着重连浪费凭证。
    </p>

    <div class="mb-3 flex flex-wrap gap-2">
      <button
        type="button"
        class="flex-1 border rounded-lg px-3 py-2 text-left text-sm transition"
        :class="mode === 'direct'
          ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          : 'border-gray-200 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'"
        @click="mode = 'direct'"
      >
        <span class="font-medium">直连模式（默认）</span>
        <span class="mt-0.5 block text-xs opacity-80">worker 自己连游戏，重启 worker 会掉线</span>
      </button>
      <button
        type="button"
        class="flex-1 border rounded-lg px-3 py-2 text-left text-sm transition"
        :class="mode === 'gateway'
          ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          : 'border-gray-200 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'"
        @click="mode = 'gateway'"
      >
        <span class="font-medium">网关模式</span>
        <span class="mt-0.5 block text-xs opacity-80">连接常驻，重启 worker 不掉线</span>
      </button>
    </div>

    <p
      v-if="envOverride"
      class="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
    >
      检测到环境变量 <code class="font-mono">FARM_NETWORK_MODE={{ envOverride }}</code>，
      它会覆盖这里的设置（运维临时覆盖优先）。
    </p>
    <p
      v-if="state?.restartRequired"
      class="mb-3 rounded bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
    >
      设置已保存，<strong>重启面板后生效</strong>。
    </p>

    <div class="flex items-center gap-2">
      <BaseButton :loading="saving" :disabled="!dirty || loading" @click="save">
        保存
      </BaseButton>
      <BaseButton variant="secondary" :disabled="loading || saving" @click="load">
        刷新
      </BaseButton>
      <span class="text-xs text-gray-500 dark:text-gray-400">
        保存后需重启面板；重启 worker 不需要重新扫码（仅网关模式下）
      </span>
    </div>
  </div>
</template>
