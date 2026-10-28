import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import api from '@/api'

export interface PluginAutomationSpec {
  key: string
  label: string
  detail: string
  type: 'boolean' | 'select' | 'number'
  default: boolean | number
  window?: string
  options?: Array<{ value: number, label: string }>
}

export interface PluginWindow {
  startTime: number
  endTime: number
}

export interface PluginGameConfig {
  provides: boolean
  urlPrefix: string
}

export interface PluginInfo {
  id: string
  name: string
  description: string
  version: string
  enabled: boolean
  error: string
  status: 'disabled' | 'active' | 'upcoming' | 'ended' | 'error'
  installedAt: number
  updatedAt: number
  activityIds: number[]
  windows: Record<string, PluginWindow>
  card: { icon: string, image: string, updatedMs: number }
  automation: PluginAutomationSpec[]
  frontend: { entryUrl: string, cssUrl: string, assetPrefix: string }
  gameConfig: PluginGameConfig | null
  history: Array<{ version: string, installedAt: number, dir?: string }>
  live: boolean
}

/** 插件大类：素材插件（只提供 gameConfig 合并）、活动插件（有前端面板/自动化/协议） */
export type PluginCategory = 'material' | 'activity' | 'hybrid'

export function getPluginCategory(plugin: PluginInfo): PluginCategory {
  const isMaterial = !!plugin.gameConfig?.provides
  const isActivity = !!(plugin.frontend?.entryUrl || plugin.automation?.length)
  if (isMaterial && isActivity)
    return 'hybrid'
  if (isMaterial)
    return 'material'
  return 'activity'
}

export const usePluginsStore = defineStore('plugins', () => {
  const plugins = ref<PluginInfo[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  const enabledPlugins = computed(() => plugins.value.filter(plugin => plugin.enabled))

  function byId(id: string) {
    return plugins.value.find(plugin => plugin.id === id) || null
  }

  /** 启用中且活动窗口（主窗口）覆盖当前时间的插件 */
  function activeWithinWindow(nowMs: number) {
    return enabledPlugins.value.filter((plugin) => {
      const primary = plugin.windows.activity || Object.values(plugin.windows)[0]
      if (!primary)
        return false
      return nowMs >= primary.startTime * 1000 && nowMs <= primary.endTime * 1000
    })
  }

  async function fetchPlugins(force = false) {
    if (loading.value || (loaded.value && !force))
      return
    loading.value = true
    try {
      const { data } = await api.get('/api/plugins')
      if (data.ok && Array.isArray(data.plugins)) {
        plugins.value = data.plugins
        loaded.value = true
      }
    }
    catch {
      // 插件接口不可用时活动中心与设置页仍按内置活动工作
    }
    finally {
      loading.value = false
    }
  }

  /** 安装/启停/卸载后强制刷新 */
  async function refresh() {
    loaded.value = false
    await fetchPlugins(true)
  }

  async function uploadPlugin(file: File) {
    const form = new FormData()
    form.append('file', file)
    const { data } = await api.post('/api/plugins/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
    })
    await refresh()
    return data
  }

  async function pluginAction(id: string, action: 'enable' | 'disable' | 'uninstall' | 'rollback') {
    const { data } = await api.post(`/api/plugins/${encodeURIComponent(id)}/${action}`)
    await refresh()
    return data
  }

  return {
    plugins,
    enabledPlugins,
    loading,
    loaded,
    byId,
    activeWithinWindow,
    fetchPlugins,
    refresh,
    uploadPlugin,
    pluginAction,
  }
})
