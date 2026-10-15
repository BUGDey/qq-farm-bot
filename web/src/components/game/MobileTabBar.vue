<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import NavMoreMenu from '@/components/game/NavMoreMenu.vue'
import { menuRoutes } from '@/router/menu'
import { useAccountStore } from '@/stores/account'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const userStore = useUserStore()
const accountStore = useAccountStore()
const { currentAccount } = storeToRefs(accountStore)

const primaryItems = [
  { path: '/', label: '首页', icon: 'i-fas-home' },
  { path: '/personal', label: '农场', icon: 'i-carbon-sprout' },
  { path: '/friends', label: '朋友', icon: 'i-carbon-user-multiple' },
  { path: '/activity', label: '活动', icon: 'i-carbon-gift' },
].filter((item) => {
  const target = menuRoutes.find(menu => `/${menu.path}` === item.path || (item.path === '/' && menu.path === ''))
  return !target?.adminOnly || userStore.isAdmin
})

const moreItems = menuRoutes
  .filter(item => !['dashboard', 'personal', 'friends', 'activity'].includes(item.name))
  // 管理后台等入口只对管理员可见（与侧边栏行为一致）
  .filter(item => !item.adminOnly || userStore.isAdmin)
  .map(item => ({
    path: item.path ? `/${item.path}` : '/',
    label: item.label,
    icon: item.icon,
  }))
</script>

<template>
  <div class="mobile-tabbar">
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
        <img
          v-if="currentAccount?.avatar"
          :src="currentAccount.avatar"
          alt="我的"
          class="h-full w-full object-cover"
        >
        <div v-else class="i-carbon-user text-lg text-emerald-600" />
      </span>
      <span class="tab-label">我的</span>
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
