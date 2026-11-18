<script setup lang="ts">
import type { GameSpace } from '@/stores/game-space'
import { useRoute, useRouter } from 'vue-router'
import { useGameSpaceStore } from '@/stores/game-space'

const route = useRoute()
const router = useRouter()
const gameSpace = useGameSpaceStore()
const options: { value: GameSpace, label: string, icon: string }[] = [
  { value: 'farm', label: '农场', icon: 'i-carbon-sprout' },
  { value: 'ranch', label: '牧场', icon: 'i-carbon-cattle' },
]

function switchSpace(space: GameSpace) {
  const currentSection = route.path.startsWith('/ranch/') ? route.path.split('/')[2] : ''
  gameSpace.setSpace(space)
  if (route.path === '/activity' || route.path === '/settings') return
  if (space === 'ranch') {
    const ranchSection = currentSection || ({ '/': '', '/personal': 'personal', '/friends': 'friends', '/shop': 'shop', '/illustrated': 'illustrated', '/analytics': 'analytics' }[route.path] ?? '')
    router.push({ path: ranchSection ? `/ranch/${ranchSection}` : '/ranch', query: route.query, hash: route.hash })
    return
  }
  const farmPath = currentSection ? ({ personal: '/personal', friends: '/friends', shop: '/shop', illustrated: '/illustrated', analytics: '/analytics', activity: '/activity' }[currentSection] ?? '/') : ({ '/ranch/personal': '/personal', '/ranch/friends': '/friends', '/ranch/shop': '/shop', '/ranch/illustrated': '/illustrated', '/ranch/analytics': '/analytics', '/ranch/activity': '/activity' }[route.path] ?? (route.path === '/ranch' ? '/' : ''))
  if (farmPath) router.push({ path: farmPath, query: route.query, hash: route.hash })
}
</script>

<template>
  <div class="space-switch" role="group" aria-label="切换游戏空间">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="space-option"
      :class="{ selected: gameSpace.space === option.value }"
      :aria-pressed="gameSpace.space === option.value"
      @click="switchSpace(option.value)"
    >
      <span class="space-icon" :class="option.icon" aria-hidden="true" />
      <span>{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.space-switch { display: inline-flex; align-items: center; gap: 4px; padding: 3px; border: 1px solid rgba(255,255,255,.55); border-radius: 999px; background: rgba(255,255,255,.45); backdrop-filter: blur(12px); }
.space-option { display:inline-flex; min-width:56px; min-height:34px; align-items:center; justify-content:center; gap:4px; border:0; border-radius:999px; padding:6px 10px; background:transparent; color:#52665a; font-size:13px; font-weight:600; cursor:pointer; transition:background .2s ease,color .2s ease; }
.space-option.selected { background:#059669; color:#fff; }
.space-option:focus-visible { outline:2px solid #047857; outline-offset:2px; }
.space-icon { font-size:16px; }
@media (max-width:479px) { .space-option { min-width:48px; padding-inline:7px; } .space-icon { display:none; } }
</style>
