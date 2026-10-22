<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import api from '@/api'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

// 普通用户是否可见全部农场账号（默认关闭：普通用户只能看到自己添加的账号）
// 原位于 管理后台 → 全局设置，移到 账号管理 页（开关直接作用于本页账号列表）
const usersSeeAllAccounts = ref(false)
const visibilityLoaded = ref(false)
const visibilitySaving = ref(false)

async function loadVisibility() {
  try {
    const res = await api.get('/api/admin/account-visibility')
    if (res.data?.ok)
      usersSeeAllAccounts.value = res.data.data?.usersSeeAllAccounts === true
    visibilityLoaded.value = true
  }
  catch {
    toast.error('读取账号可见性设置失败')
  }
}

async function toggleVisibility(value: boolean | undefined) {
  if (visibilitySaving.value)
    return
  visibilitySaving.value = true
  try {
    const res = await api.post('/api/admin/account-visibility', { usersSeeAllAccounts: value === true })
    if (res.data?.ok) {
      usersSeeAllAccounts.value = res.data.data?.usersSeeAllAccounts === true
      toast.success(usersSeeAllAccounts.value ? '普通用户现已可见全部账号' : '普通用户仅可见自己添加的账号')
    }
    else {
      await rollbackVisibility(value === true)
      toast.error(res.data?.error || '保存失败')
    }
  }
  catch {
    await rollbackVisibility(value === true)
    toast.error('保存失败')
  }
  finally {
    visibilitySaving.value = false
  }
}

async function rollbackVisibility(target: boolean) {
  usersSeeAllAccounts.value = target
  await nextTick()
  usersSeeAllAccounts.value = !target
}

onMounted(() => {
  loadVisibility()
})
</script>

<template>
  <div class="ui-card overflow-hidden rounded-xl p-4">
    <div class="mb-1 flex items-center gap-2">
      <div class="i-carbon-user-multiple text-lg" style="color: var(--theme-primary);" />
      <h2 class="text-base text-gray-900 font-semibold dark:text-gray-100">
        普通用户可见全部账号
      </h2>
    </div>
    <p class="mb-3 text-xs text-gray-500 leading-relaxed dark:text-gray-400">
      开启后普通用户在账号列表可以看到其他用户添加的农场账号（仍然只能操作自己的，他人账号的创建者信息会脱敏显示）。
      默认关闭：普通用户只能看到自己添加的账号。
    </p>
    <div class="flex items-center justify-between gap-3">
      <span class="text-xs text-gray-400">{{ visibilityLoaded ? (usersSeeAllAccounts ? '当前：可见全部账号' : '当前：仅可见自己的账号') : '读取中…' }}</span>
      <BaseSwitch
        :model-value="usersSeeAllAccounts"
        :disabled="visibilitySaving"
        @update:model-value="toggleVisibility"
      />
    </div>
  </div>
</template>
