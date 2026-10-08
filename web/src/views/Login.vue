<script setup lang="ts">
import type { ApiResult } from '@/stores/user'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToastStore } from '@/stores/toast'
import {

  useUserStore,
} from '@/stores/user'

type TabKey = 'login' | 'register' | 'reset'

const router = useRouter()
const userStore = useUserStore()
const toast = useToastStore()

const tab = ref<TabKey>('login')
const loading = ref(false)

// 登录
const loginForm = ref({ username: '', password: '' })

// 注册
const registerForm = ref({ username: '', password: '', confirm: '', cardCode: '' })
const cardPreview = ref<{ ok: boolean, error?: string, data?: any } | null>(null)
const checkingCard = ref(false)

// 找回密码
const resetStep = ref<1 | 2>(1)
const resetForm = ref({ username: '', cardCode: '', newPassword: '' })

const tabs: { key: TabKey, label: string, icon: string }[] = [
  { key: 'login', label: '登录', icon: 'i-carbon-login' },
  { key: 'register', label: '注册', icon: 'i-carbon-user-follow' },
  { key: 'reset', label: '找回密码', icon: 'i-carbon-password' },
]

const passwordMismatch = computed(
  () => registerForm.value.confirm.length > 0
    && registerForm.value.password !== registerForm.value.confirm,
)

const canSubmit = computed(() => {
  if (loading.value)
    return false
  if (tab.value === 'login')
    return !!loginForm.value.username && !!loginForm.value.password
  if (tab.value === 'register') {
    return !!registerForm.value.username
      && !!registerForm.value.password
      && !passwordMismatch.value
      && !!registerForm.value.cardCode
  }
  return !!resetForm.value.username && !!resetForm.value.cardCode
    && (resetStep.value === 1 || !!resetForm.value.newPassword)
})

function showResult(result: ApiResult | undefined, fallback: string, okMessage?: string) {
  if (result?.ok) {
    if (okMessage)
      toast.success(okMessage)
    return true
  }
  toast.error(result?.error || fallback)
  return false
}

async function handleLogin() {
  if (!canSubmit.value)
    return
  loading.value = true
  try {
    const result = await userStore.login(loginForm.value.username, loginForm.value.password)
    if (result.ok) {
      await userStore.fetchUserInfo()
      toast.success('登录成功')
      router.push('/')
      return
    }
    toast.error(result.error || '登录失败')
  }
  finally {
    loading.value = false
  }
}

let cardPreviewTimer: ReturnType<typeof setTimeout> | null = null

function scheduleCardPreview() {
  cardPreview.value = null
  if (cardPreviewTimer)
    clearTimeout(cardPreviewTimer)
  const code = registerForm.value.cardCode.trim()
  if (code.length < 4)
    return
  cardPreviewTimer = setTimeout(async () => {
    checkingCard.value = true
    try {
      cardPreview.value = await userStore.peekCard(code)
    }
    finally {
      checkingCard.value = false
    }
  }, 400)
}

async function handleRegister() {
  if (!canSubmit.value)
    return
  loading.value = true
  try {
    const result = await userStore.register(
      registerForm.value.username,
      registerForm.value.password,
      registerForm.value.cardCode.trim(),
    )
    if (!showResult(result, '注册失败'))
      return
    toast.success('注册成功，请使用账号密码登录')
    loginForm.value.username = registerForm.value.username
    loginForm.value.password = ''
    registerForm.value = { username: '', password: '', confirm: '', cardCode: '' }
    cardPreview.value = null
    tab.value = 'login'
  }
  finally {
    loading.value = false
  }
}

async function handleReset() {
  if (!canSubmit.value)
    return
  loading.value = true
  try {
    if (resetStep.value === 1) {
      const result = await userStore.verifyResetPassword(resetForm.value.username, resetForm.value.cardCode)
      if (showResult(result, '验证失败')) {
        toast.success('验证通过，请设置新密码')
        resetStep.value = 2
      }
      return
    }
    const result = await userStore.resetPassword(
      resetForm.value.username,
      resetForm.value.cardCode,
      resetForm.value.newPassword,
    )
    if (!showResult(result, '重置失败'))
      return
    toast.success('密码重置成功，请重新登录')
    resetStep.value = 1
    resetForm.value = { username: '', cardCode: '', newPassword: '' }
    tab.value = 'login'
  }
  finally {
    loading.value = false
  }
}

function submit() {
  if (tab.value === 'login')
    return handleLogin()
  if (tab.value === 'register')
    return handleRegister()
  return handleReset()
}

onMounted(() => {
  if (userStore.isLoggedIn && !userStore.isExpired)
    router.replace('/')
})
</script>

<template>
  <div class="relative min-h-screen w-full flex items-center justify-center overflow-hidden p-4">
    <div
      class="pointer-events-none absolute h-96 w-96 rounded-full opacity-40 blur-3xl -left-40 -top-40"
      style="background: radial-gradient(circle, color-mix(in srgb, var(--theme-primary) 55%, transparent), transparent 70%);"
    />
    <div
      class="pointer-events-none absolute h-96 w-96 rounded-full opacity-30 blur-3xl -bottom-40 -right-32"
      style="background: radial-gradient(circle, color-mix(in srgb, var(--theme-primary) 45%, transparent), transparent 70%);"
    />

    <div class="ui-card-elevated relative max-w-md w-full rounded-2xl p-6 md:p-8">
      <div class="mb-6 flex flex-col items-center gap-2 text-center">
        <div class="h-14 w-14 flex items-center justify-center overflow-hidden rounded-2xl ring-1 ring-gray-200 dark:ring-gray-700">
          <img src="/icon.png" alt="logo" class="h-full w-full object-cover">
        </div>
        <h1 class="text-xl text-gray-900 font-bold dark:text-gray-100">
          QQ 农场智能助手
        </h1>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          多用户账号系统 · 注册需绑定卡密
        </p>
      </div>

      <!-- Tab 切换 -->
      <div class="grid grid-cols-3 mb-6 gap-1 rounded-xl p-1" style="background: var(--surface-2);">
        <button
          v-for="item in tabs"
          :key="item.key"
          class="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all"
          :class="tab === item.key
            ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
          @click="tab = item.key"
        >
          <div :class="item.icon" class="text-sm" />
          <span>{{ item.label }}</span>
        </button>
      </div>

      <form class="space-y-4" @submit.prevent="submit">
        <!-- 登录 -->
        <template v-if="tab === 'login'">
          <div>
            <label class="mb-1.5 block text-xs text-gray-600 font-medium dark:text-gray-300">用户名</label>
            <input
              v-model="loginForm.username"
              type="text"
              autocomplete="username"
              placeholder="请输入用户名"
              class="focus:border-primary w-full border rounded-xl px-3 py-2.5 text-sm outline-none transition"
              style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);"
            >
          </div>
          <div>
            <label class="mb-1.5 block text-xs text-gray-600 font-medium dark:text-gray-300">密码</label>
            <input
              v-model="loginForm.password"
              type="password"
              autocomplete="current-password"
              placeholder="请输入密码"
              class="focus:border-primary w-full border rounded-xl px-3 py-2.5 text-sm outline-none transition"
              style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);"
              @keyup.enter="submit"
            >
          </div>
        </template>

        <!-- 注册 -->
        <template v-else-if="tab === 'register'">
          <div>
            <label class="mb-1.5 block text-xs text-gray-600 font-medium dark:text-gray-300">用户名</label>
            <input
              v-model="registerForm.username"
              type="text"
              placeholder="3-32 位字母/数字/下划线"
              class="focus:border-primary w-full border rounded-xl px-3 py-2.5 text-sm outline-none transition"
              style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);"
            >
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1.5 block text-xs text-gray-600 font-medium dark:text-gray-300">密码</label>
              <input
                v-model="registerForm.password"
                type="password"
                placeholder="至少 6 位"
                class="focus:border-primary w-full border rounded-xl px-3 py-2.5 text-sm outline-none transition"
                style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);"
              >
            </div>
            <div>
              <label class="mb-1.5 block text-xs text-gray-600 font-medium dark:text-gray-300">确认密码</label>
              <input
                v-model="registerForm.confirm"
                type="password"
                placeholder="再次输入"
                class="focus:border-primary w-full border rounded-xl px-3 py-2.5 text-sm outline-none transition"
                :style="{
                  borderColor: passwordMismatch ? '#ef4444' : 'var(--surface-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--theme-text)',
                }"
              >
            </div>
          </div>
          <div>
            <label class="mb-1.5 block text-xs text-gray-600 font-medium dark:text-gray-300">
              卡密（决定账号有效期）
            </label>
            <input
              v-model="registerForm.cardCode"
              type="text"
              placeholder="例如 XXXX-XXXX-XXXX-XXXX"
              class="focus:border-primary w-full border rounded-xl px-3 py-2.5 text-sm font-mono outline-none transition"
              style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);"
              @input="scheduleCardPreview"
            >
            <div v-if="checkingCard" class="mt-1.5 text-xs text-gray-400">
              正在校验卡密…
            </div>
            <div
              v-else-if="cardPreview"
              class="mt-1.5 flex items-center gap-1.5 text-xs"
              :class="cardPreview.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'"
            >
              <div :class="cardPreview.ok ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-filled'" />
              <span v-if="cardPreview.ok">
                {{ cardPreview.data?.type === 'quota' ? `额度卡 · +${cardPreview.data?.value} 个账号` : `加时卡 · ${cardPreview.data?.isPermanent ? '永久' : `${cardPreview.data?.durationValue}${cardPreview.data?.durationUnit === 'hour' ? ' 小时' : ' 天'}`}` }}
              </span>
              <span v-else>{{ cardPreview.error }}</span>
            </div>
            <p v-if="passwordMismatch" class="mt-1.5 text-xs text-red-500">
              两次输入的密码不一致
            </p>
          </div>
        </template>

        <!-- 找回密码 -->
        <template v-else>
          <div>
            <label class="mb-1.5 block text-xs text-gray-600 font-medium dark:text-gray-300">用户名</label>
            <input
              v-model="resetForm.username"
              type="text"
              placeholder="请输入用户名"
              class="focus:border-primary w-full border rounded-xl px-3 py-2.5 text-sm outline-none transition"
              style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);"
            >
          </div>
          <div>
            <label class="mb-1.5 block text-xs text-gray-600 font-medium dark:text-gray-300">
              曾用卡密（用于验证身份）
            </label>
            <input
              v-model="resetForm.cardCode"
              type="text"
              placeholder="该账号核销过的卡密"
              class="focus:border-primary w-full border rounded-xl px-3 py-2.5 text-sm font-mono outline-none transition"
              style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);"
            >
          </div>
          <div v-if="resetStep === 2">
            <label class="mb-1.5 block text-xs text-gray-600 font-medium dark:text-gray-300">新密码</label>
            <input
              v-model="resetForm.newPassword"
              type="password"
              placeholder="至少 6 位"
              class="focus:border-primary w-full border rounded-xl px-3 py-2.5 text-sm outline-none transition"
              style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);"
            >
          </div>
        </template>

        <button
          type="submit"
          :disabled="!canSubmit"
          class="bg-gradient-primary w-full rounded-xl py-2.5 text-sm text-white font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
        >
          <span v-if="loading" class="i-svg-spinners-90-ring-with-bg align-middle" />
          <span v-else>
            {{ tab === 'login' ? '登录' : tab === 'register' ? '注册并激活' : resetStep === 1 ? '验证身份' : '重置密码' }}
          </span>
        </button>
      </form>

      <p class="mt-5 text-center text-[11px] text-gray-400 leading-relaxed">
        注册需使用加时卡激活账号；额度卡用于提升可添加农场账号数量。<br>
        忘记密码时可用已核销过的卡密验证身份。
      </p>
    </div>
  </div>
</template>
