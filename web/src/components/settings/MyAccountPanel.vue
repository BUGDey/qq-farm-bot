<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

const renewCardCode = ref('')
const renewLoading = ref(false)
const renewMsg = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const oldPassword = ref('')
const newPassword = ref('')
const pwdLoading = ref(false)
const pwdMsg = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const roleLabel = computed(() => {
  switch (userStore.userInfo?.role) {
    case 'super_admin': return '超级管理员'
    case 'admin': return '管理员'
    default: return '普通用户'
  }
})

async function handleRenew() {
  if (!renewCardCode.value.trim()) {
    renewMsg.value = { type: 'error', text: '请输入续费卡密' }
    return
  }
  renewLoading.value = true
  renewMsg.value = null
  try {
    const result = await userStore.renew(renewCardCode.value.trim())
    if (result?.ok) {
      const cardType = result.data?.cardType
      renewMsg.value = {
        type: 'success',
        text: cardType === 'quota'
          ? `续费成功，账号额度已提升至 ${result.data?.accountLimit}`
          : `续费成功${result.data?.card?.expiresAt ? `，有效期至 ${new Date(result.data.card.expiresAt).toLocaleString('zh-CN')}` : ''}`,
      }
      renewCardCode.value = ''
    } else {
      renewMsg.value = { type: 'error', text: result?.error || '续费失败' }
    }
  } catch (e: any) {
    renewMsg.value = { type: 'error', text: e?.response?.data?.error || e.message || '续费失败' }
  } finally {
    renewLoading.value = false
  }
}

async function handleChangePassword() {
  if (!oldPassword.value || !newPassword.value) {
    pwdMsg.value = { type: 'error', text: '请填写原密码和新密码' }
    return
  }
  if (newPassword.value.length < 6) {
    pwdMsg.value = { type: 'error', text: '新密码长度至少 6 位' }
    return
  }
  pwdLoading.value = true
  pwdMsg.value = null
  try {
    const result = await userStore.changePassword(oldPassword.value, newPassword.value)
    if (result?.ok) {
      pwdMsg.value = { type: 'success', text: result.message || '密码修改成功' }
      oldPassword.value = ''
      newPassword.value = ''
    } else {
      pwdMsg.value = { type: 'error', text: result?.error || '密码修改失败' }
    }
  } catch (e: any) {
    pwdMsg.value = { type: 'error', text: e?.response?.data?.error || e.message || '密码修改失败' }
  } finally {
    pwdLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <!-- 账号信息 -->
    <div class="ui-card rounded-xl p-5">
      <h3 class="text-lg font-bold mb-4">
        账号信息
      </h3>
      <dl class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div class="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <dt class="text-gray-500">
            用户名
          </dt>
          <dd class="font-medium">
            {{ userStore.username }}
          </dd>
        </div>
        <div class="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <dt class="text-gray-500">
            角色
          </dt>
          <dd class="font-medium">
            {{ roleLabel }}
          </dd>
        </div>
        <div class="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <dt class="text-gray-500">
            账号额度
          </dt>
          <dd class="font-medium">
            {{ userStore.accountLimit }} 个
          </dd>
        </div>
        <div class="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <dt class="text-gray-500">
            有效期至
          </dt>
          <dd class="font-medium" :class="userStore.isExpired ? 'text-red-500' : ''">
            {{ userStore.expireTimeText }}
          </dd>
        </div>
      </dl>
    </div>

    <!-- 续费 -->
    <div class="ui-card rounded-xl p-5">
      <h3 class="text-lg font-bold mb-1">
        卡密续费
      </h3>
      <p class="mb-4 text-xs text-gray-500">
        时间卡延长有效期，额度卡增加可绑定的账号数量。
      </p>
      <div class="flex flex-col gap-3 sm:flex-row">
        <BaseInput
          v-model="renewCardCode"
          placeholder="请输入续费卡密"
          class="flex-1"
          @keyup.enter="handleRenew"
        />
        <BaseButton variant="primary" :loading="renewLoading" @click="handleRenew">
          立即续费
        </BaseButton>
      </div>
      <p v-if="renewMsg" class="mt-3 text-sm" :class="renewMsg.type === 'success' ? 'text-green-600' : 'text-red-500'">
        {{ renewMsg.text }}
      </p>
    </div>

    <!-- 修改密码 -->
    <div class="ui-card rounded-xl p-5">
      <h3 class="text-lg font-bold mb-4">
        修改密码
      </h3>
      <div class="grid max-w-md grid-cols-1 gap-4">
        <BaseInput v-model="oldPassword" type="password" label="原密码" placeholder="请输入原密码" />
        <BaseInput v-model="newPassword" type="password" label="新密码" placeholder="至少 6 位，建议混合多种字符" />
        <div>
          <BaseButton variant="primary" :loading="pwdLoading" @click="handleChangePassword">
            保存新密码
          </BaseButton>
        </div>
      </div>
      <p v-if="pwdMsg" class="mt-3 text-sm" :class="pwdMsg.type === 'success' ? 'text-green-600' : 'text-red-500'">
        {{ pwdMsg.text }}
      </p>
    </div>
  </div>
</template>
