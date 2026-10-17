<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import MobileTabBar from '@/components/game/MobileTabBar.vue'
import MysteryMerchantBanner from '@/components/shop/MysteryMerchantBanner.vue'
import TopAccountMenu from '@/components/TopAccountMenu.vue'
import { menuRoutes } from '@/router/menu'
import { useAccountStore } from '@/stores/account'
import { useAppStore } from '@/stores/app'
import { useStatusStore } from '@/stores/status'
import { useUserStore } from '@/stores/user'

const appStore = useAppStore()
const router = useRouter()

const accountStore = useAccountStore()
const statusStore = useStatusStore()
const userStore = useUserStore()
const { currentAccount } = storeToRefs(accountStore)
const { status, realtimeConnected } = storeToRefs(statusStore)

const searchKeyword = ref('')
const searchFocused = ref(false)

// 原侧边栏的系统保活逻辑：ping、账号轮询、实时状态连接
const wsErrorNotifiedAt = ref<Record<string, number>>({})

async function checkConnection() {
  try {
    const res = await api.get('/api/ping')
    if (res.data?.ok) {
      const accountRef = currentAccount.value?.id || currentAccount.value?.uin
      if (accountRef)
        statusStore.connectRealtime(String(accountRef))
    }
  }
  catch {
    // 网络异常时静默，等待下轮重试
  }
}

async function refreshStatusFallback() {
  if (realtimeConnected.value)
    return
  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  if (accountRef)
    await statusStore.fetchStatus(String(accountRef))
}

onMounted(() => {
  appStore.fetchLoginPageConfig()
  accountStore.fetchAccounts()
  checkConnection()
  userStore.fetchUserInfo()
})

onBeforeUnmount(() => {
  statusStore.disconnectRealtime()
})

useIntervalFn(checkConnection, 30000)
useIntervalFn(() => {
  refreshStatusFallback()
  accountStore.fetchAccounts()
}, 10000)

watch(() => currentAccount.value?.id || currentAccount.value?.uin || '', () => {
  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  statusStore.connectRealtime(String(accountRef || ''))
  refreshStatusFallback()
}, { immediate: true })

watch(() => status.value?.wsError, (wsError: any) => {
  if (!wsError || Number(wsError.code) !== 400 || !currentAccount.value)
    return
  const errAt = Number(wsError.at) || 0
  const accId = String(currentAccount.value.id || currentAccount.value.uin || '')
  const lastNotified = wsErrorNotifiedAt.value[accId] || 0
  if (errAt <= lastNotified)
    return
  wsErrorNotifiedAt.value[accId] = errAt
  router.push('/settings')
}, { deep: true })

const searchResults = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword)
    return []
  return menuRoutes
    // 权限隔离：adminOnly 仅管理员、superOnly 仅超管可被搜到（与侧边栏/移动导航一致）
    .filter(item => (!item.adminOnly || userStore.isAdmin) && (!item.superOnly || userStore.isSuperAdmin))
    .filter(item => item.label.toLowerCase().includes(keyword) || item.name.toLowerCase().includes(keyword))
    .map(item => ({
      path: item.path ? `/${item.path}` : '/',
      label: item.label,
      icon: item.icon,
    }))
})

function goTo(item: { path: string }) {
  searchKeyword.value = ''
  searchFocused.value = false
  router.push(item.path)
}

function onSearchBlur() {
  // 延迟关闭，保证点击结果先触发跳转
  window.setTimeout(() => {
    searchFocused.value = false
  }, 150)
}
</script>

<template>
  <div class="dashboard-layout w-screen flex overflow-hidden" style="height: 100dvh;">
    <!-- Dashboard Background Image（PC / 移动端分别在 style.css 内切换） -->
    <div class="dashboard-bg" />

    <main class="relative h-full min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
      <!-- 顶栏：右侧搜索 / 主题 / 通知 / 账号 -->
      <header class="relative z-30 flex shrink-0 items-center justify-end gap-4 px-3 pt-2 lg:px-8 sm:px-6 lg:pt-4 sm:pt-3">
        <div class="flex items-center gap-4">
          <div class="search-box relative hidden lg:flex">
            <div class="search-icon i-carbon-search" />
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="搜索功能…"
              @focus="searchFocused = true"
              @blur="onSearchBlur"
              @keydown.enter="searchResults[0] && goTo(searchResults[0])"
            >
            <div
              v-if="searchFocused && searchKeyword && searchResults.length"
              class="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden border border-white/60 rounded-2xl bg-white/95 p-1.5 shadow-xl backdrop-blur-md"
            >
              <button
                v-for="item in searchResults"
                :key="item.path"
                class="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-emerald-50 hover:text-emerald-600"
                @mousedown.prevent="goTo(item)"
              >
                <div :class="[item.icon]" class="text-base" />
                <span>{{ item.label }}</span>
              </button>
            </div>
          </div>

          <a
            class="icon-btn"
            href="https://github.com/BUGDey/qq-farm-bot"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub 项目主页"
          >
            <div class="i-carbon-logo-github text-lg text-gray-500" />
          </a>

          <button
            class="icon-btn hidden lg:flex"
            title="活动"
            @click="router.push('/activity')"
          >
            <div class="i-carbon-notification text-lg text-gray-500" />
          </button>

          <TopAccountMenu light />
        </div>
      </header>

      <!-- Main Content Area -->
      <div class="custom-scrollbar min-h-0 flex flex-1 flex-col overflow-y-auto p-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:p-6 md:p-5 sm:p-3 lg:pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pt-2 md:pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <MysteryMerchantBanner />
        <RouterView v-slot="{ Component, route }">
          <Transition name="slide-fade" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </div>
    </main>

    <MobileTabBar />
  </div>
</template>

<style scoped>
/* Dashboard Layout */
.dashboard-layout {
  position: relative;
}

/* PC 搜索框 */
.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 300px;
  border-radius: 999px;
  padding: 9px 18px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 14px rgba(31, 38, 80, 0.12);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.2s ease;
}

.search-box:focus-within {
  background: #fff;
  box-shadow: 0 6px 18px rgba(31, 38, 80, 0.16);
}

.search-icon {
  font-size: 16px;
  color: rgba(0, 0, 0, 0.35);
  flex-shrink: 0;
}

.search-box input {
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: #333;
}

.search-box input::placeholder {
  color: rgba(0, 0, 0, 0.32);
}

.icon-btn {
  display: flex;
  height: 40px;
  width: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  background: #fff;
}

/* 移动端隐藏搜索框与通知按钮（scoped display 会覆盖 hidden 工具类，需显式隐藏） */
@media (max-width: 1023px) {
  .search-box,
  .icon-btn {
    display: none;
  }
}

/* Slide Fade Transition */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease-out;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.25);
}

.custom-scrollbar {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* 滚动容器的直接子元素（各页面根节点）不允许被压缩：
   flex 子项默认 flex-shrink:1，内容超高时会被压矮，溢出部分不产生滚动距离，
   导致手机端"下面还有内容却滑不下去" */
.custom-scrollbar > * {
  flex-shrink: 0;
}
</style>
