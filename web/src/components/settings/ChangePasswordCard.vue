<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStorage } from '@vueuse/core'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useToastStore } from '@/stores/toast'

const router = useRouter()
const toastStore = useToastStore()

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)

const adminToken = useStorage('admin_token', '')
const userInfo = useStorage('user_info', '')

async function handleChangePassword() {
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    toastStore.error('请填写完整信息')
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    toastStore.error('两次输入的新密码不一致')
    return
  }

  if (newPassword.value.length < 6) {
    toastStore.error('新密码长度至少为 6 位')
    return
  }

  loading.value = true
  try {
    const { data } = await api.post('/api/change-password', {
      oldPassword: oldPassword.value,
      newPassword: newPassword.value,
    })

    if (data?.ok) {
      toastStore.success('密码修改成功')
      oldPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
    }
    else {
      toastStore.error(data?.error || '密码修改失败')
    }
  }
  catch (error: any) {
    const message = error?.response?.data?.error || error?.message || '密码修改失败'
    toastStore.error(message)
  }
  finally {
    loading.value = false
  }
}

function handleLogout() {
  adminToken.value = ''
  userInfo.value = ''
  toastStore.success('已退出登录')
  router.push('/login')
}
</script>

<template>
  <div class="ui-card rounded-lg p-6">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="flex items-center gap-2 text-lg font-medium">
        <div class="i-carbon-password" />
        <span>修改密码</span>
      </h3>
      
      <BaseButton
        variant="danger"
        size="sm"
        @click="handleLogout"
      >
        <div class="i-carbon-logout mr-1" />
        退出登录
      </BaseButton>
    </div>

    <div class="max-w-md space-y-4">
      <div>
        <label class="mb-2 block text-sm font-medium">旧密码</label>
        <BaseInput
          v-model="oldPassword"
          type="password"
          placeholder="请输入旧密码"
          autocomplete="current-password"
        />
      </div>

      <div>
        <label class="mb-2 block text-sm font-medium">新密码</label>
        <BaseInput
          v-model="newPassword"
          type="password"
          placeholder="请输入新密码（至少 6 位）"
          autocomplete="new-password"
        />
      </div>

      <div>
        <label class="mb-2 block text-sm font-medium">确认新密码</label>
        <BaseInput
          v-model="confirmPassword"
          type="password"
          placeholder="请再次输入新密码"
          autocomplete="new-password"
        />
      </div>

      <BaseButton
        variant="primary"
        :loading="loading"
        @click="handleChangePassword"
      >
        <div class="i-carbon-checkmark mr-1" />
        保存
      </BaseButton>
    </div>
  </div>
</template>
