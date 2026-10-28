<script setup lang="ts">
import type { PluginCategory, PluginInfo } from '@/stores/plugins'
import { computed, onMounted, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { getPluginCategory, usePluginsStore } from '@/stores/plugins'
import { useToastStore } from '@/stores/toast'
import { useUserStore } from '@/stores/user'

// 通用插件管理页：活动插件 + 素材插件共享。
// 上传 zip 安装并立即生效，支持启停/回滚/卸载。
// 上传与操作仅限超级管理员（服务端二次校验角色）。
const pluginsStore = usePluginsStore()
const toast = useToastStore()
const userStore = useUserStore()

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const pendingAction = ref('')
const confirmText = ref('')

const statusLabels: Record<string, string> = {
  active: '运行中',
  upcoming: '未开始',
  ended: '已结束',
  disabled: '已停用',
  error: '异常',
}

const categoryLabels: Record<PluginCategory, string> = {
  activity: '活动插件',
  material: '素材插件',
  hybrid: '活动+素材',
}

const categoryBadgeClass: Record<PluginCategory, string> = {
  activity: 'bg-cyan-100 text-cyan-800',
  material: 'bg-emerald-100 text-emerald-800',
  hybrid: 'bg-violet-100 text-violet-800',
}

function getCategory(plugin: PluginInfo): PluginCategory {
  return getPluginCategory(plugin)
}

function isMaterialOnly(plugin: PluginInfo): boolean {
  return getCategory(plugin) === 'material'
}

const canManage = computed(() => userStore.isAdmin)
const sortedPlugins = computed(() => [...pluginsStore.plugins].sort((left, right) => right.updatedAt - left.updatedAt))

function formatTime(timestamp: number) {
  if (!timestamp)
    return '-'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp))
}

function pickFile() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file)
    return
  if (!file.name.toLowerCase().endsWith('.zip')) {
    toast.error('请选择插件 zip 包')
    return
  }
  uploading.value = true
  try {
    const result = await pluginsStore.uploadPlugin(file)
    if (result.ok)
      toast.success(`插件 ${result.plugin?.name || ''} v${result.plugin?.version || ''} 已安装并生效`)
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || error?.message || '插件安装失败')
  }
  finally {
    uploading.value = false
  }
}

async function runAction(id: string, action: 'enable' | 'disable' | 'uninstall' | 'rollback') {
  if (action === 'uninstall' && confirmText.value !== `卸载 ${id}`)
    return
  pendingAction.value = `${id}:${action}`
  try {
    await pluginsStore.pluginAction(id, action)
    const labels: Record<string, string> = { enable: '已启用', disable: '已停用', uninstall: '已卸载', rollback: '已回滚' }
    toast.success(`插件 ${id} ${labels[action]}`)
    confirmText.value = ''
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || error?.message || '操作失败')
  }
  finally {
    pendingAction.value = ''
  }
}

onMounted(() => {
  void pluginsStore.fetchPlugins(true)
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-base text-gray-900 font-semibold">
          插件管理
        </h2>
        <p class="mt-1 text-xs text-gray-500">
          上传插件 zip 包即时安装生效，无需重启服务或重新构建前端。活动插件提供面板与自动化，素材插件自动合并到核心配置与静态路由。
        </p>
      </div>
      <div v-if="canManage">
        <input ref="fileInput" type="file" accept=".zip" class="hidden" @change="onFileChange">
        <BaseButton variant="primary" :loading="uploading" @click="pickFile">
          <span class="i-carbon-upload mr-1.5" />
          上传插件包
        </BaseButton>
      </div>
    </div>

    <div v-if="pluginsStore.loading && !pluginsStore.plugins.length" class="py-12 text-center text-sm text-gray-500">
      正在加载插件清单...
    </div>
    <div v-else-if="!sortedPlugins.length" class="border border-gray-200 rounded-lg border-dashed p-10 text-center text-sm text-gray-500">
      暂未安装任何插件
    </div>

    <div v-for="plugin in sortedPlugins" :key="plugin.id" class="border border-gray-200 rounded-lg bg-white/80 p-4 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span :class="plugin.card.icon || 'i-carbon-plug'" class="text-lg text-cyan-600" />
            <h3 class="text-sm text-gray-900 font-semibold">
              {{ plugin.name }}
            </h3>
            <code class="text-xs text-gray-400">{{ plugin.id }}@v{{ plugin.version }}</code>
            <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="categoryBadgeClass[getCategory(plugin)]">
              {{ categoryLabels[getCategory(plugin)] }}
            </span>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-medium" :class="{
                'bg-cyan-100 text-cyan-800': plugin.status === 'active',
                'bg-gray-100 text-gray-600': plugin.status === 'disabled' || plugin.status === 'ended',
                'bg-amber-100 text-amber-800': plugin.status === 'upcoming',
              }"
            >{{ statusLabels[plugin.status] || plugin.status }}</span>
            <span v-if="plugin.error" class="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">异常</span>
          </div>
          <p class="mt-1 text-xs text-gray-500">
            {{ plugin.description || (isMaterialOnly(plugin) ? '提供素材自动合并' : '暂无描述') }}
          </p>
          <p class="mt-1 text-xs text-gray-400">
            安装于 {{ formatTime(plugin.installedAt) }} · 更新于 {{ formatTime(plugin.updatedAt) }}
            <template v-if="isMaterialOnly(plugin)">
              <span v-if="plugin.gameConfig?.urlPrefix"> · 静态前缀 {{ plugin.gameConfig.urlPrefix }}</span>
              <span> · 更新版本即推送新素材</span>
            </template>
            <template v-else>
              · 自动化开关 {{ plugin.automation.length }} 个
            </template>
          </p>
          <p v-if="plugin.error" class="mt-1 text-xs text-red-600">
            {{ plugin.error }}
          </p>
        </div>
        <div v-if="canManage" class="flex flex-wrap items-center gap-2">
          <template v-if="isMaterialOnly(plugin)">
            <span class="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
              <span class="i-carbon-locked mr-1" />
              素材插件禁止停用/卸载，上传新版本覆盖即可
            </span>
          </template>
          <template v-else>
            <BaseButton v-if="plugin.enabled" variant="secondary" :loading="pendingAction === `${plugin.id}:disable`" @click="runAction(plugin.id, 'disable')">
              停用
            </BaseButton>
            <BaseButton v-else variant="primary" :loading="pendingAction === `${plugin.id}:enable`" @click="runAction(plugin.id, 'enable')">
              启用
            </BaseButton>
            <BaseButton v-if="plugin.history.length" variant="secondary" :loading="pendingAction === `${plugin.id}:rollback`" @click="runAction(plugin.id, 'rollback')">
              回滚到 v{{ plugin.history[0]?.version }}
            </BaseButton>
            <div class="flex items-center gap-1.5">
              <input
                v-model="confirmText"
                :placeholder="`输入「卸载 ${plugin.id}」`"
                class="w-40 border border-gray-300 rounded px-2 py-1.5 text-xs"
                :aria-label="`确认卸载 ${plugin.id}`"
              >
              <BaseButton variant="danger" :disabled="confirmText !== `卸载 ${plugin.id}`" :loading="pendingAction === `${plugin.id}:uninstall`" @click="runAction(plugin.id, 'uninstall')">
                卸载
              </BaseButton>
            </div>
          </template>
        </div>
      </div>
      <div v-if="plugin.automation.length" class="mt-3 flex flex-wrap gap-1.5">
        <span v-for="spec in plugin.automation" :key="spec.key" class="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
          {{ spec.label }}
        </span>
      </div>
    </div>
  </div>
</template>
