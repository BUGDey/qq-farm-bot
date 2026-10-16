<script setup lang="ts">
import type { Theme } from '@/stores/app'
import { computed, nextTick, onMounted, ref } from 'vue'
import api from '@/api'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useAppStore } from '@/stores/app'
import { useToastStore } from '@/stores/toast'

const appStore = useAppStore()
const toast = useToastStore()

const selected = ref<Theme | ''>('')
const saved = ref<Theme | ''>('')
const loading = ref(false)
const saving = ref(false)

// 免费卡密功能
const freeCardEnabled = ref(false)
const freeCardStock = ref(0)
const freeCardLoaded = ref(false)
const freeCardSaving = ref(false)

// 默认版本号
const defaultVersion = ref('')
const defaultVersionSaved = ref('')
const defaultVersionLoading = ref(false)
const defaultVersionSaving = ref(false)

const themeEntries = computed(() =>
  Object.entries(appStore.themes) as [Theme, typeof appStore.themes[Theme]][],
)

const dirty = computed(() => selected.value !== saved.value)

async function load() {
  loading.value = true
  try {
    const res = await api.get('/api/public/ui-theme')
    const theme = String(res.data?.data?.theme || '')
    if (theme && (theme in appStore.themes)) {
      selected.value = theme as Theme
      saved.value = theme as Theme
    }
  }
  catch {
    toast.error('读取全局主题失败')
  }
  finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const res = await api.post('/api/admin/ui-theme', { theme: selected.value })
    if (res.data?.ok) {
      saved.value = selected.value
      toast.success(selected.value ? '全局主题已保存' : '已恢复为不指定全局主题')
    }
    else {
      toast.error(res.data?.error || '保存失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '保存失败')
  }
  finally {
    saving.value = false
  }
}

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
  load()
  loadFreeCardStatus()
  loadDefaultVersion()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 免费卡密功能 -->
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

    <!-- 全局默认主题 -->
    <div class="ui-card overflow-hidden rounded-xl p-4">
      <div class="mb-1 flex items-center gap-2">
        <div class="i-carbon-color-palette text-lg" style="color: var(--theme-primary);" />
        <h2 class="text-base text-gray-900 font-semibold dark:text-gray-100">
          全局默认主题
        </h2>
      <span v-if="loading" class="text-xs text-gray-400">读取中…</span>
    </div>
    <p class="mb-4 text-xs text-gray-500 leading-relaxed dark:text-gray-400">
      所有登录用户默认使用这里选择的主题；用户自己在右上角主题按钮里选过别的主题的，保留他自己的选择不受影响。
      选择「不指定」则回到各自默认主题。
    </p>

    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <button
        v-for="[key, t] in themeEntries"
        :key="key"
        type="button"
        class="relative flex flex-col items-center justify-center gap-2 rounded-lg p-3 transition-all hover:scale-105"
        :class="{ 'ring-2 ring-offset-2 dark:ring-offset-gray-800': selected === key }"
        :style="{
          'background': t.gradient,
          '--tw-ring-color': t.primary,
          '--tw-ring-offset-color': t.isDark ? '#1f2937' : '#ffffff',
        }"
        :title="t.name"
        @click="selected = key"
      >
        <div :class="t.icon" class="text-xl text-white" />
        <span class="text-sm text-white font-medium">{{ t.name }}</span>
        <div
          v-if="selected === key"
          class="i-carbon-checkmark absolute right-1 top-1 text-sm text-white"
        />
      </button>

      <!-- 不指定全局主题 -->
      <button
        type="button"
        class="relative flex flex-col items-center justify-center gap-2 border border-gray-200 rounded-lg border-dashed p-3 text-gray-400 transition-all dark:border-gray-600 hover:border-gray-300 dark:text-gray-500 hover:text-gray-500 dark:hover:border-gray-500"
        :class="{ '!border-solid ring-2 ring-gray-400 ring-offset-2 dark:ring-offset-gray-800': selected === '' }"
        title="不指定"
        @click="selected = ''"
      >
        <div class="i-carbon-close text-xl" />
        <span class="text-sm font-medium">不指定</span>
        <div
          v-if="selected === ''"
          class="i-carbon-checkmark absolute right-1 top-1 text-sm"
        />
      </button>
    </div>

    <div class="mt-4 flex items-center gap-2">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-white font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
        style="background: var(--theme-primary);"
        :disabled="saving || loading || !dirty"
        @click="save"
      >
        <div v-if="saving" class="i-svg-spinners-90-ring-with-bg text-sm" />
        {{ saving ? '保存中…' : '保存' }}
      </button>
      <span v-if="saved" class="text-xs text-gray-400">
        当前生效：{{ appStore.themes[saved as Theme]?.name }}
      </span>
      <span v-else class="text-xs text-gray-400">
        当前生效：不指定（各用户使用默认主题）
      </span>
    </div>
    </div>
  </div>
</template>
