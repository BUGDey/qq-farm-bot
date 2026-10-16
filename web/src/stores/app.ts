import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import api from '@/api'

const THEME_KEY = 'ui_theme'
const THEME_CUSTOM_KEY = 'ui_theme_custom'

export type Theme = 'light-blue' | 'light-green' | 'light-pink' | 'dark-blue' | 'dark-purple' | 'dark-teal' | 'dark-orange' | 'dark-red'

/** 全新安装（没有任何本地选择、管理员也没设全局主题）时的默认主题：桃花林 */
export const DEFAULT_THEME: Theme = 'light-pink'

export interface LoginPageConfig {
  logoUrl: string
  title: string
  loginSubtitle: string
  registerSubtitle: string
  purchaseUrl: string
  qqGroupUrl: string
}

const defaultLoginPageConfig: LoginPageConfig = {
  logoUrl: '',
  title: 'QQ农场智能助手',
  loginSubtitle: '欢迎回来，开启智慧农耕之旅',
  registerSubtitle: '创建账号，开启智慧农耕之旅',
  purchaseUrl: '',
  qqGroupUrl: '',
}

export const useAppStore = defineStore('app', () => {
  const sidebarOpen = ref(false)
  const currentTheme = ref<Theme>((localStorage.getItem(THEME_KEY) as Theme) || DEFAULT_THEME)
  const showThemePanel = ref(false)
  const loginPageConfig = ref<LoginPageConfig>({ ...defaultLoginPageConfig })
  let loginPageConfigPromise: Promise<void> | null = null

  const themes: Record<Theme, {
    name: string
    isDark: boolean
    bg: string
    text: string
    primary: string
    secondary: string
    gradient: string
    icon: string
  }> = {
    'light-blue': {
      name: '田园绿',
      isDark: false,
      bg: 'transparent',
      text: '#2C3E50',
      primary: '#2ECC71',
      secondary: '#3498DB',
      gradient: 'linear-gradient(135deg, #2ECC71 0%, #3498DB 100%)',
      icon: 'i-fas-leaf',
    },
    'dark-blue': {
      name: '暮色林',
      isDark: true,
      bg: 'transparent',
      text: '#ECF0F1',
      primary: '#2ECC71',
      secondary: '#3498DB',
      gradient: 'linear-gradient(135deg, #2ECC71 0%, #3498DB 100%)',
      icon: 'i-carbon-moon',
    },
    'light-pink': {
      name: '桃花林',
      isDark: false,
      bg: '#fff0f5',
      text: '#831843',
      primary: '#ec4899',
      secondary: '#be185d',
      gradient: 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)',
      icon: 'i-carbon-favorite',
    },
    'light-green': {
      name: '清新绿',
      isDark: false,
      bg: '#f0fdf4',
      text: '#14532d',
      primary: '#22c55e',
      secondary: '#16a34a',
      gradient: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
      icon: 'i-fas-leaf',
    },
    'dark-purple': {
      name: '紫罗兰',
      isDark: true,
      bg: '#1e1b4b',
      text: '#e9d5ff',
      primary: '#a855f7',
      secondary: '#9333ea',
      gradient: 'linear-gradient(135deg, #c084fc 0%, #a855f7 100%)',
      icon: 'i-fas-crown',
    },
    'dark-orange': {
      name: '暖阳橙',
      isDark: true,
      bg: '#292524',
      text: '#fef3c7',
      primary: '#f59e0b',
      secondary: '#d97706',
      gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
      icon: 'i-carbon-sun',
    },
    'dark-teal': {
      name: '青空青',
      isDark: true,
      bg: '#134e4a',
      text: '#ccfbf1',
      primary: '#06b6d4',
      secondary: '#0891b2',
      gradient: 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)',
      icon: 'i-carbon-tree',
    },
    'dark-red': {
      name: '绯红夜',
      isDark: true,
      bg: '#18181b',
      text: '#fda4af',
      primary: '#f43f5e',
      secondary: '#e11d48',
      gradient: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)',
      icon: 'i-carbon-close-filled',
    },
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }

  function closeSidebar() {
    sidebarOpen.value = false
  }

  function openSidebar() {
    sidebarOpen.value = true
  }

  async function fetchTheme() {
    try {
      const res = await api.get('/api/settings')
      const theme = res.data?.data?.ui?.theme as Theme | undefined
      if (res.data.ok && theme && themes[theme])
        applyTheme(theme)
    }
    catch {
      // 未登录时静默失败，使用本地缓存主题。
    }
  }

  // 用户是否主动选择过主题。选择过则全局默认主题不再覆盖他的选择。
  function isThemeCustomized() {
    return localStorage.getItem(THEME_CUSTOM_KEY) === '1'
  }

  // 拉取管理员设置的全局默认主题。仅当用户没有自己的主题偏好时才应用，
  // 同时把结果写入 ui_theme，避免下次启动时先闪一下默认主题再等接口。
  async function fetchGlobalTheme(): Promise<Theme | null> {
    if (isThemeCustomized())
      return null
    try {
      const res = await api.get('/api/public/ui-theme')
      const theme = res.data?.data?.theme as Theme | undefined
      if (res.data.ok && theme && themes[theme]) {
        applyTheme(theme)
        return theme
      }
    }
    catch {
      // 未设置全局主题或接口不可用时保持本地主题。
    }
    return null
  }

  // 放弃自己的主题选择：回到「系统默认」——管理员设了全局主题就用全局的，
  // 没设就用全新安装的默认主题（桃花林）。之后管理员改全局主题会重新生效。
  async function resetTheme() {
    localStorage.removeItem(THEME_CUSTOM_KEY)
    const globalTheme = await fetchGlobalTheme()
    // 管理员没指定全局主题时，回到全新安装的默认主题（桃花林）
    if (!globalTheme)
      applyTheme(DEFAULT_THEME)
  }

  async function fetchLoginPageConfig() {
    if (loginPageConfigPromise)
      return loginPageConfigPromise

    loginPageConfigPromise = api.get('/api/public/login-links').then((res) => {
      if (res.data?.ok && res.data.data) {
        loginPageConfig.value = { ...defaultLoginPageConfig, ...res.data.data }
        document.title = loginPageConfig.value.title || defaultLoginPageConfig.title
      }
    }).catch(() => {
      // 保留默认品牌，页面仍可正常使用。
    }).finally(() => {
      loginPageConfigPromise = null
    })
    return loginPageConfigPromise
  }

  // custom 为 true 表示用户主动选择（主题面板点击或明暗切换），
  // 之后管理员改全局默认主题不再覆盖该用户。
  function applyTheme(theme: Theme, options?: { custom?: boolean }) {
    if (!themes[theme]) {
      theme = DEFAULT_THEME
    }

    const t = themes[theme]
    currentTheme.value = theme
    localStorage.setItem(THEME_KEY, theme)
    if (options?.custom)
      localStorage.setItem(THEME_CUSTOM_KEY, '1')

    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.style.setProperty('--theme-bg', t.bg)
      document.documentElement.style.setProperty('--theme-text', t.text)
      document.documentElement.style.setProperty('--theme-primary', t.primary)
      document.documentElement.style.setProperty('--theme-secondary', t.secondary)
      document.documentElement.style.setProperty('--theme-gradient', t.gradient)

      if (t.isDark) {
        document.documentElement.classList.add('dark')
      }
      else {
        document.documentElement.classList.remove('dark')
      }
    }
  }

  function toggleThemePanel() {
    showThemePanel.value = !showThemePanel.value
  }

  function toggleDark() {
    const current = currentTheme.value
    if (themes[current]?.isDark) {
      applyTheme('light-green', { custom: true })
    }
    else {
      applyTheme('light-pink', { custom: true })
    }
  }

  const isDark = computed(() => themes[currentTheme.value]?.isDark ?? false)

  watch(currentTheme, (val) => {
    applyTheme(val)
  })

  applyTheme(currentTheme.value)

  return {
    sidebarOpen,
    isDark,
    currentTheme,
    showThemePanel,
    loginPageConfig,
    themes,
    applyTheme,
    toggleThemePanel,
    toggleDark,
    toggleSidebar,
    closeSidebar,
    openSidebar,
    fetchTheme,
    fetchGlobalTheme,
    resetTheme,
    fetchLoginPageConfig,
  }
})
