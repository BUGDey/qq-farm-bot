<script setup lang="ts">
import { useAccountStore } from '@/stores/account'

withDefaults(defineProps<{ title: string, loading?: boolean, busy?: boolean, error?: string, hasData?: boolean }>(), { hasData: true })
defineEmits<{ refresh: [] }>()
const account = useAccountStore()
</script>

<template>
  <section class="space-y-5">
    <div v-if="!account.currentAccountId" class="ui-card rounded-lg p-8 text-center text-gray-500">
      请先选择账号
    </div>
    <template v-else>
      <p v-if="error && error !== '账号未运行'" class="border border-red-200 rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300" role="alert">
        {{ error }}
      </p>
      <div v-if="loading && !hasData" class="ui-card rounded-lg p-8 text-center text-gray-500">
        正在读取牧场数据…
      </div>
      <div v-else-if="!hasData && !error" class="ui-card rounded-lg p-8 text-center text-gray-500">
        暂无数据
      </div>
      <slot />
    </template>
  </section>
</template>
