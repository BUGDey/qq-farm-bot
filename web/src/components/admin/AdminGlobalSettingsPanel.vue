<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import api from '@/api'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

// 免费卡密功能
const freeCardEnabled = ref(false)
const freeCardStock = ref(0)
const freeCardLoaded = ref(false)
const freeCardSaving = ref(false)
// 「普通用户可见全部账号」开关已移到 设置 → 账号管理 页（AccountVisibilityCard.vue）

// 默认版本号
const defaultVersion = ref('')
const defaultVersionSaved = ref('')
const defaultVersionLoading = ref(false)
const defaultVersionSaving = ref(false)

async function loadFreeCardStatus() {
  try {
    const res = await api.get('/api/admin/card-claim/status')
    if (res.data?.ok) {
      freeCardEnabled.value = res.data.data?.enabled === true
      freeCardStock.value = Number(res.data.data?.availableTimeCards) || 0
      freeCardLoaded.value = true
    }
  }
  catch {
    toast.error('读取免费卡密开关状态失败')
  }
}

// 开关被拒/失败时回滚：BaseSwitch 内部已先行翻转，需先把 prop 对齐再翻回，触发同步
async function rollbackFreeCard(targetEnabled: boolean) {
  freeCardEnabled.value = targetEnabled
  await nextTick()
  freeCardEnabled.value = !targetEnabled
}

async function toggleFreeCard(value: boolean | undefined) {
  const enabled = value === true
  if (freeCardSaving.value)
    return
  freeCardSaving.value = true
  try {
    const res = await api.post('/api/admin/card-claim/status', { enabled, confirmed: true })
    if (res.data?.ok) {
      freeCardEnabled.value = res.data.data?.enabled === true
      freeCardStock.value = Number(res.data.data?.availableTimeCards) || 0
      toast.success(enabled ? '免费卡密功能已开启' : '免费卡密功能已关闭')
    }
    else {
      await rollbackFreeCard(enabled)
      toast.error(res.data?.error || '保存失败')
    }
  }
  catch (error: any) {
    await rollbackFreeCard(enabled)
    toast.error(error?.response?.data?.error || '保存失败')
  }
  finally {
    freeCardSaving.value = false
  }
}

async function loadDefaultVersion() {
  defaultVersionLoading.value = true
  try {
    const res = await api.get('/api/admin/system-config')
    if (res.data?.ok) {
      const version = String(res.data.data?.saved?.clientVersion || res.data.data?.default?.clientVersion || '')
      defaultVersion.value = version
      defaultVersionSaved.value = version
    }
  }
  catch {
    toast.error('读取默认版本号失败')
  }
  finally {
    defaultVersionLoading.value = false
  }
}

async function saveDefaultVersion() {
  const clientVersion = defaultVersion.value.trim()
  if (!clientVersion) {
    toast.error('请填写默认版本号')
    return
  }
  if (clientVersion === defaultVersionSaved.value)
    return
  defaultVersionSaving.value = true
  try {
    const res = await api.post('/api/admin/default-version', { clientVersion, confirmed: true })
    if (res.data?.ok) {
      defaultVersionSaved.value = String(res.data.data?.saved?.clientVersion || clientVersion)
      defaultVersion.value = defaultVersionSaved.value
      toast.success('默认版本号已保存，并同步到所有账号')
    }
    else {
      toast.error(res.data?.error || '保存失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '保存失败')
  }
  finally {
    defaultVersionSaving.value = false
  }
}

onMounted(() => {
  loadFreeCardStatus()
  loadDefaultVersion()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="ui-card overflow-hidden rounded-xl p-4">
      <div class="mb-1 flex items-center gap-2">
        <div class="i-carbon-gift text-lg" style="color: var(--theme-primary);" />
        <h2 class="text-base text-gray-900 font-semibold dark:text-gray-100">
          免费卡密功能
        </h2>
        <span v-if="!freeCardLoaded" class="text-xs text-gray-400">读取中…</span>
      </div>
      <p class="mb-3 text-xs text-gray-500 leading-relaxed dark:text-gray-400">
        开启后，访客可在注册页点击「领取免费卡密」自动获得并填入一张卡密用于注册新账号。
        只有卡密管理中<b>描述为「免费」的加时卡</b>才可被领取；免费卡密仅可用于注册，不能用于加时长。
        每个 IP / 浏览器每 24 小时各限领 1 张，领取后锁定 30 分钟，未注册自动释放回库存。
      </p>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <BaseSwitch
          :model-value="freeCardEnabled"
          label="开启免费卡密功能"
          :disabled="freeCardSaving || !freeCardLoaded"
          @update:model-value="toggleFreeCard"
        />
        <span v-if="freeCardSaving" class="text-xs text-gray-400">保存中…</span>
        <span v-if="freeCardLoaded" class="text-xs text-gray-500 dark:text-gray-400">
          当前可领取库存：<b :class="freeCardStock > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'">{{ freeCardStock }}</b> 张免费加时卡
        </span>
      </div>
    </div>

    <!-- 默认版本号 -->
    <div class="ui-card overflow-hidden rounded-xl p-4">
      <div class="mb-1 flex items-center gap-2">
        <div class="i-carbon-version text-lg" style="color: var(--theme-primary);" />
        <h2 class="text-base text-gray-900 font-semibold dark:text-gray-100">
          默认版本号
        </h2>
        <span v-if="defaultVersionLoading" class="text-xs text-gray-400">读取中…</span>
      </div>
      <p class="mb-3 text-xs text-gray-500 leading-relaxed dark:text-gray-400">
        全局客户端版本号（形如 1.15.0.2_20261001）。保存后立即生效并同步到所有用户的账号连接，无需重启；设置错误可能导致账号无法连接，请确认后保存。
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="defaultVersion"
          type="text"
          placeholder="1.15.0.2_20261001"
          class="h-9 w-56 border border-gray-300 rounded-lg bg-transparent px-3 text-sm font-mono outline-none focus:border-[var(--theme-primary)] dark:border-gray-600"
          :disabled="defaultVersionSaving || defaultVersionLoading"
          @keyup.enter="saveDefaultVersion"
        >
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-white font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          style="background: var(--theme-primary);"
          :disabled="defaultVersionSaving || defaultVersionLoading || defaultVersion.trim() === defaultVersionSaved"
          @click="saveDefaultVersion"
        >
          <div v-if="defaultVersionSaving" class="i-svg-spinners-90-ring-with-bg text-sm" />
          {{ defaultVersionSaving ? '保存中…' : '保存' }}
        </button>
        <span v-if="defaultVersionSaved" class="text-xs text-gray-400">
          当前生效：{{ defaultVersionSaved }}
        </span>
      </div>
    </div>
  </div>
</template>
