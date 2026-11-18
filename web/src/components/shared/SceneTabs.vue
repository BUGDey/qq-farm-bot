<script setup lang="ts">
defineProps<{ tabs: { value: string, label: string, icon?: string }[] }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <nav class="flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-700" aria-label="页面分区">
    <button v-for="tab in tabs" :key="tab.value" class="min-h-11 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors" :class="model === tab.value ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'" :style="model === tab.value ? { backgroundColor: 'var(--theme-primary)' } : {}" :aria-current="model === tab.value ? 'page' : undefined" @click="model = tab.value">
      <span v-if="tab.icon" :class="tab.icon" />{{ tab.label }}
    </button>
  </nav>
</template>
