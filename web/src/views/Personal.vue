<script setup lang="ts">
import { ref } from 'vue'
import BagPanel from '@/components/BagPanel.vue'
import FarmPanel from '@/components/FarmPanel.vue'
import TaskPanel from '@/components/TaskPanel.vue'

const currentTab = ref<'farm' | 'bag' | 'task'>('farm')
</script>

<template>
  <div class="h-full flex flex-col p-2 pt-1 sm:p-4 sm:pt-1">
    <div class="mb-1.5 flex space-x-2">
      <button
        class="rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4 sm:text-base"
        :class="currentTab === 'farm'
          ? 'text-white shadow-md'
          : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        :style="currentTab === 'farm' ? { backgroundColor: 'var(--theme-primary)' } : {}"
        @click="currentTab = 'farm'"
      >
        <div class="flex items-center space-x-2">
          <div class="i-carbon-sprout text-lg" />
          <span>我的农场</span>
        </div>
      </button>
      <button
        class="rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4 sm:text-base"
        :class="currentTab === 'bag'
          ? 'text-white shadow-md'
          : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        :style="currentTab === 'bag' ? { backgroundColor: 'var(--theme-primary)' } : {}"
        @click="currentTab = 'bag'"
      >
        <div class="flex items-center space-x-2">
          <div class="i-carbon-box text-lg" />
          <span>我的背包</span>
        </div>
      </button>
      <button
        class="rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4 sm:text-base"
        :class="currentTab === 'task'
          ? 'text-white shadow-md'
          : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        :style="currentTab === 'task' ? { backgroundColor: 'var(--theme-primary)' } : {}"
        @click="currentTab = 'task'"
      >
        <div class="flex items-center space-x-2">
          <div class="i-carbon-task text-lg" />
          <span>我的任务</span>
        </div>
      </button>
    </div>

    <!-- 手机上土地详情卡片向左/右各探出 8px，把留白还给农场场景（PC 保持原样） -->
    <div
      class="flex-1 overflow-hidden overflow-y-auto"
      :class="currentTab === 'farm' ? '-mx-2 sm:mx-0' : ''"
    >
      <Transition
        mode="out-in"
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="transform opacity-0 scale-95"
        enter-to-class="transform opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="transform opacity-100 scale-100"
        leave-to-class="transform opacity-0 scale-95"
      >
        <component :is="currentTab === 'farm' ? FarmPanel : (currentTab === 'bag' ? BagPanel : TaskPanel)" />
      </Transition>
    </div>
  </div>
</template>
