<script setup lang="ts">
import type { Theme } from '@/stores/app'
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import { useAppStore } from '@/stores/app'
import { useToastStore } from '@/stores/toast'

const appStore = useAppStore()
const toast = useToastStore()

const selected = ref<Theme | ''>('')
const saved = ref<Theme | ''>('')
const loading = ref(false)
const saving = ref(false)

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

onMounted(load)
</script>

<template>
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
</template>
