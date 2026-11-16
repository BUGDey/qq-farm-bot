<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  item: any
}>()

const imageError = ref(false)

watch(() => props.item?.image, () => {
  imageError.value = false
})
</script>

<template>
  <article class="min-w-0 flex flex-col overflow-hidden border border-gray-200 rounded-lg bg-white shadow-sm transition hover:border-emerald-400 dark:border-gray-700 dark:bg-gray-800">
    <div class="relative grid h-24 place-items-center bg-gray-50 dark:bg-gray-900/40">
      <span class="absolute left-0 top-0 rounded-br-lg bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 font-semibold dark:bg-gray-700 dark:text-gray-300">
        #{{ item.id }}
      </span>
      <span class="absolute right-0 top-0 rounded-bl-lg bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 font-semibold dark:bg-amber-900/20 dark:text-amber-300">
        {{ item.price }} {{ item.currency || '金券' }}
      </span>
      <img
        v-if="item.image && !imageError"
        :src="item.image"
        :alt="item.name"
        class="max-h-14 max-w-14 object-contain"
        loading="lazy"
        @error="imageError = true"
      >
      <div v-else class="grid h-14 w-14 place-items-center rounded-lg bg-white text-sm text-gray-500 font-semibold dark:bg-gray-800">
        {{ String(item.name || '?').slice(0, 1) }}
      </div>
    </div>

    <div class="flex flex-1 flex-col p-3">
      <div class="line-clamp-2 text-center text-sm text-gray-900 font-semibold dark:text-gray-100">
        {{ item.name }}
      </div>
      <div class="mt-1 text-center text-xs text-gray-500 dark:text-gray-400">
        Lv.{{ item.level }} 解锁
      </div>
      <div v-if="item.desc" class="mt-1 line-clamp-2 text-center text-[11px] text-gray-400 leading-4">
        {{ item.desc }}
      </div>
    </div>
  </article>
</template>
