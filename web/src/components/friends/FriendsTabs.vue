<script setup lang="ts">
export type FriendTabKey = 'friends' | 'cheat' | 'blacklist' | 'visitors'

export interface FriendTabItem {
  key: FriendTabKey
  label: string
  icon: string
}

defineProps<{
  tabs: readonly FriendTabItem[]
  blacklistCount: number
}>()

const activeTab = defineModel<FriendTabKey>('activeTab', { required: true })
</script>

<template>
  <div class="mb-4 flex flex-wrap gap-2">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium backdrop-blur-md transition-all sm:gap-2 sm:px-4"
      :class="activeTab === tab.key
        ? 'border-transparent text-white shadow-md'
        : 'border-white/60 bg-white/55 text-gray-700 hover:bg-white/80 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/20'"
      :style="activeTab === tab.key ? { backgroundColor: 'var(--theme-primary)' } : {}"
      @click="activeTab = tab.key"
    >
      <div :class="tab.icon" />
      {{ tab.label }}
      <span
        v-if="tab.key === 'blacklist' && blacklistCount > 0"
        class="rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400"
      >
        {{ blacklistCount }}
      </span>
    </button>
  </div>
</template>
