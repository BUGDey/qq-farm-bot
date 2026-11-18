<script setup lang="ts">
defineProps<{ item: any, badge: string }>()
</script>

<template>
  <article class="min-h-[216px] min-w-0 flex flex-col overflow-hidden border border-gray-200 rounded-lg bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div class="relative grid h-24 shrink-0 place-items-center bg-gray-50 dark:bg-gray-900/40">
      <span class="absolute left-0 top-0 rounded-br-lg bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 font-semibold dark:bg-gray-700 dark:text-gray-300">#{{ item.id }}</span>
      <span class="absolute right-0 top-0 rounded-bl-lg bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 font-semibold dark:bg-emerald-900/20 dark:text-emerald-300">{{ badge }}</span>
      <img v-if="item.image" :src="item.image" :alt="item.name" class="max-h-14 max-w-14 object-contain">
      <div v-else class="grid h-14 w-14 place-items-center rounded-lg bg-white text-sm text-gray-500 font-semibold dark:bg-gray-800">
        {{ String(item.name || '?').slice(0, 1) }}
      </div>
    </div>
    <div class="min-h-[120px] flex flex-1 flex-col gap-1 p-3">
      <h2 class="line-clamp-2 break-words text-center text-sm text-gray-900 font-semibold dark:text-gray-100">
        {{ item.name || `物品 ${item.itemId}` }}
      </h2>
      <slot />
    </div>
  </article>
</template>
