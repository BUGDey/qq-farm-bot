<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import NavMoreMenu from '@/components/game/NavMoreMenu.vue'
import { menuRoutes } from '@/router/menu'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const userStore = useUserStore()

const primaryItems = [
  { path: '/', label: '首页', icon: 'i-fas-home' },
  { path: '/personal', label: '农场', icon: 'i-carbon-sprout' },
  { path: '/friends', label: '朋友', icon: 'i-carbon-user-multiple' },
  { path: '/activity', label: '活动', icon: 'i-carbon-gift' },
].filter((item) => {
  const target = menuRoutes.find(menu => `/${menu.path}` === item.path || (item.path === '/' && menu.path === ''))
  return (!target?.adminOnly || userStore.isAdmin) && (!target?.superOnly || userStore.isSuperAdmin)
})

// 「我的账户 / 设置 / 管理后台」已从更多菜单移除：设置改为底部独立 tab，
// 我的账号与管理后台在设置页内有入口。
const moreItems = menuRoutes
  .filter(item => !['dashboard', 'personal', 'friends', 'activity', 'account', 'Settings', 'adminPanel'].includes(item.name))
  // 受限入口按角色隔离（与侧边栏行为一致）：adminOnly 仅管理员、superOnly 仅超管
  .filter(item => (!item.adminOnly || userStore.isAdmin) && (!item.superOnly || userStore.isSuperAdmin))
  .map(item => ({
    path: item.path ? `/${item.path}` : '/',
    label: item.label,
    icon: item.icon,
  }))

/**
 * 移动端菜单栏自动隐藏：30 秒无操作隐藏；滚动到页面最顶部或最底部时重新显示并重新计时。
 * 仅在窄屏（<1024px）启用；页面不可滚动时保持常显，避免没有唤回手段。
 */
const barVisible = ref(true)
const HIDE_DELAY_MS = 30000
const EDGE_THRESHOLD = 4
const SHOW_ON_SCROLL_UP_DELTA = 2
let hideTimer: ReturnType<typeof setTimeout> | undefined
const scrollContainers = new Set<HTMLElement>()
const lastScrollTop = new WeakMap<HTMLElement, number>()
const autoHideMedia = window.matchMedia('(max-width: 1023px)')

function autoHideEnabled(el: HTMLElement | null) {
  if (!autoHideMedia.matches || !el)
    return false
  // 页面内容不足一屏时没有滚动边界可以唤回菜单栏，保持常显
  return el.scrollHeight > el.clientHeight + EDGE_THRESHOLD
}

function scheduleHide() {
  clearTimeout(hideTimer)
  hideTimer = undefined
  const main = document.querySelector<HTMLElement>('.custom-scrollbar')
  if (!autoHideEnabled(main))
    return
  hideTimer = setTimeout(() => {
    barVisible.value = false
  }, HIDE_DELAY_MS)
}

function showBar() {
  barVisible.value = true
  scheduleHide()
}

function handleScroll(event: Event) {
  const el = event.target as HTMLElement | null
  if (!el)
    return
  if (!autoHideEnabled(el))
    return
  const last = lastScrollTop.get(el) ?? el.scrollTop
  const delta = el.scrollTop - last
  lastScrollTop.set(el, el.scrollTop)
  const atTop = el.scrollTop <= EDGE_THRESHOLD
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - EDGE_THRESHOLD
  // 任意位置上滑、或滚动到上下边缘时唤回菜单栏；下滑只重置隐藏计时
  if (delta < -SHOW_ON_SCROLL_UP_DELTA || atTop || atBottom)
    showBar()
}

// 路由切换会重建滚动容器，旧引用会失效导致滚动唤不回菜单栏；每次都重新绑定
function bindScrollContainers() {
  for (const el of scrollContainers)
    el.removeEventListener('scroll', handleScroll)
  scrollContainers.clear()
  document.querySelectorAll<HTMLElement>('.custom-scrollbar').forEach((el) => {
    el.addEventListener('scroll', handleScroll, { passive: true })
    scrollContainers.add(el)
  })
}

onMounted(() => {
  bindScrollContainers()
  scheduleHide()
})

watch(() => route.path, () => nextTick(bindScrollContainers))

onUnmounted(() => {
  clearTimeout(hideTimer)
  for (const el of scrollContainers)
    el.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div
    class="mobile-tabbar"
    :class="{ 'tabbar-hidden': !barVisible }"
    @pointerdown="showBar"
  >
    <div class="tabbar-glass">
      <RouterLink
        v-for="item in primaryItems"
        :key="item.path"
        :to="item.path"
        class="tab-item"
        :class="{ active: route.path === item.path }"
      >
        <span class="tab-icon-box">
          <span class="tab-icon" :class="[item.icon]" />
        </span>
        <span class="tab-label">{{ item.label }}</span>
      </RouterLink>

      <NavMoreMenu :items="moreItems" direction="up" class="tab-item tab-more" />
    </div>

    <RouterLink to="/settings" class="tab-me" :class="{ active: route.path === '/settings' }">
      <span class="me-avatar">
        <div class="i-carbon-settings text-lg text-emerald-600" />
      </span>
      <span class="tab-label">设置</span>
    </RouterLink>
  </div>
</template>

<style scoped>
.mobile-tabbar {
  position: fixed;
  bottom: calc(10px + env(safe-area-inset-bottom));
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 12px;
  pointer-events: none;
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.mobile-tabbar.tabbar-hidden {
  transform: translateY(calc(100% + 20px));
  opacity: 0;
}

.tabbar-glass {
  pointer-events: auto;
  display: flex;
  flex: 1;
  max-width: 420px;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
  border-radius: 28px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  box-shadow: 0 10px 30px rgba(31, 38, 80, 0.16);
}

.tab-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 2px 0;
  text-decoration: none;
  color: #5b6b60;
  transition: color 0.2s ease;
}

.tab-icon-box {
  display: flex;
  height: 34px;
  width: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  transition: all 0.2s ease;
}

.tab-icon {
  font-size: 20px;
}

.tab-label {
  font-size: 11px;
  font-weight: 600;
}

.tab-item.active {
  color: #059669;
}

.tab-item.active .tab-icon-box {
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  box-shadow: 0 5px 12px rgba(16, 185, 129, 0.4);
  color: #fff;
}

.tab-more {
  position: relative;
}

.tab-more :deep(.more-trigger) {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 2px 0;
  border-radius: 14px;
  color: #5b6b60;
}

.tab-more :deep(.more-icon-dots) {
  display: flex;
  height: 34px;
  width: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  gap: 3.5px;
}

.tab-more :deep(.more-icon-dots i) {
  width: 4.5px;
  height: 4.5px;
}

.tab-more :deep(.more-label) {
  font-size: 11px;
  font-weight: 600;
}

.tab-more.active :deep(.more-trigger) {
  color: #059669;
}

.tab-me {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px 6px;
  text-decoration: none;
  color: #5b6b60;
}

.me-avatar {
  display: flex;
  height: 40px;
  width: 40px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.7);
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 6px 16px rgba(31, 38, 80, 0.2);
}

.tab-me.active {
  color: #059669;
}
</style>
