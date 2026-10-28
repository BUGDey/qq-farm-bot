<script setup lang="ts">
import type { ApiResult } from '@/stores/user'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import LoginRenewModal from '@/components/login/LoginRenewModal.vue'
import UpdateLogModal from '@/components/login/UpdateLogModal.vue'
import { APP_VERSION } from '@/data/update-log'
import { useAppStore } from '@/stores/app'
import { useToastStore } from '@/stores/toast'
import {
  useUserStore,
} from '@/stores/user'

type TabKey = 'login' | 'register' | 'reset'

const router = useRouter()
const userStore = useUserStore()
const toast = useToastStore()
const appStore = useAppStore()

const tab = ref<TabKey>('login')
const loading = ref(false)
const showUpdateLog = ref(false)
const showRenew = ref(false)
const showPassword = ref(false)

const GITHUB_URL = 'https://github.com/BUGDey/qq-farm-bot'
const REMEMBER_KEY = 'qqfarm:remembered-username'

// 登录
const loginForm = ref({ username: '', password: '' })
const rememberUsername = ref(false)

// 注册
const registerForm = ref({ username: '', password: '', confirm: '', cardCode: '' })
const cardPreview = ref<{ ok: boolean, error?: string, data?: any } | null>(null)
const checkingCard = ref(false)
const claimingCard = ref(false)

// 找回密码
const resetStep = ref<1 | 2>(1)
const resetForm = ref({ username: '', cardCode: '', newPassword: '' })

const tabs: { key: TabKey, label: string }[] = [
  { key: 'login', label: '登录' },
  { key: 'register', label: '注册' },
  { key: 'reset', label: '找回密码' },
]

const loginSubtitle = computed(() => appStore.loginPageConfig.loginSubtitle || '欢迎回来，开启智慧农耕之旅')

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
      // 记住账号仅保存用户名，绝不落地密码
      try {
        if (rememberUsername.value)
          localStorage.setItem(REMEMBER_KEY, loginForm.value.username)
        else
          localStorage.removeItem(REMEMBER_KEY)
      }
      catch {
        // 隐私模式下 localStorage 不可用，忽略
      }
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

async function handleClaimFreeCard() {
  if (claimingCard.value)
    return
  claimingCard.value = true
  try {
    const result = await userStore.claimFreeCard()
    if (!result?.ok) {
      toast.error(result?.error || '领取失败，请稍后重试')
      return
    }
    registerForm.value.cardCode = result.cardCode || ''
    scheduleCardPreview()
    toast.success(`已领取免费卡密（${result.valueText || '加时卡'}），已自动填入，请直接注册`)
  }
  finally {
    claimingCard.value = false
  }
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

function switchTab(next: TabKey) {
  tab.value = next
  resetStep.value = 1
  showPassword.value = false
}

/** 登录页续费成功后，把账号回填到登录框，方便直接登录 */
function handleRenewDone(username: string) {
  if (!username)
    return
  loginForm.value.username = username
  loginForm.value.password = ''
  tab.value = 'login'
  try {
    localStorage.setItem(REMEMBER_KEY, username)
    rememberUsername.value = true
  }
  catch {
    // 隐私模式下 localStorage 不可用，忽略
  }
}

onMounted(() => {
  appStore.fetchLoginPageConfig()
  try {
    const saved = localStorage.getItem(REMEMBER_KEY)
    if (saved) {
      loginForm.value.username = saved
      rememberUsername.value = true
    }
  }
  catch {
    // 忽略存储异常
  }
  if (userStore.isLoggedIn && !userStore.isExpired)
    router.replace('/')
})
</script>

<template>
  <div class="login-page relative min-h-screen w-full overflow-hidden">
    <!-- 全屏农场插画背景（移动端自动切换竖版） -->
    <div class="login-bg" />
    <div class="login-bg-mask" />

    <!-- 左上角品牌区（桌面端展示，贴左上角） -->
    <div class="login-brand hidden flex-col gap-3 lg:flex">
      <div class="flex items-center gap-3">
        <div class="h-14 w-14 flex items-center justify-center overflow-hidden rounded-2xl bg-white/80 shadow-lg ring-1 ring-white/70 backdrop-blur">
          <img src="/icon.png" alt="logo" class="h-full w-full object-cover">
        </div>
        <div>
          <h1 class="text-2xl text-gray-900 font-bold drop-shadow-sm">
            {{ appStore.loginPageConfig.title || 'QQ 农场智能助手' }}
          </h1>
          <p class="mt-0.5 text-sm text-gray-700/80">
            种下希望 收获快乐
          </p>
        </div>
      </div>
    </div>

    <div class="relative z-1 mx-auto max-w-[1220px] min-h-screen w-full flex items-center justify-center gap-12 px-4 py-8 lg:justify-between lg:px-10">
      <!-- 占位块：品牌区已固定到左上角，保留占位以维持卡片原有位置 -->
      <div class="hidden shrink-0 lg:block lg:w-[320px]" aria-hidden="true" />

      <!-- 右侧登录卡片 -->
      <div class="login-card max-w-[420px] w-full rounded-3xl p-6 md:p-7">
        <!-- 移动端品牌 -->
        <div class="mb-5 flex flex-col items-center gap-2 text-center lg:hidden">
          <div class="h-14 w-14 flex items-center justify-center overflow-hidden rounded-2xl bg-white/80 shadow-md ring-1 ring-white/70">
            <img src="/icon.png" alt="logo" class="h-full w-full object-cover">
          </div>
          <h1 class="text-xl text-gray-900 font-bold">
            {{ appStore.loginPageConfig.title || 'QQ 农场智能助手' }}
          </h1>
        </div>

        <div class="mb-5 text-center lg:text-left">
          <h2 class="text-xl text-gray-900 font-bold">
            {{ tab === 'register' ? '创建账号' : tab === 'reset' ? '找回密码' : '欢迎回来' }}
          </h2>
          <p class="mt-1 text-xs text-gray-500">
            {{ tab === 'login' ? loginSubtitle : tab === 'register' ? '注册需绑定卡密，额度卡可提升可添加账号数' : '使用该账号核销过的卡密验证身份' }}
          </p>
        </div>

        <!-- Tab 切换 -->
        <div class="mb-5 flex items-center gap-1 border-b border-gray-200/70">
          <button
            v-for="item in tabs"
            :key="item.key"
            type="button"
            class="relative px-3 pb-2 text-sm font-medium transition-colors"
            :class="tab === item.key ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-700'"
            @click="switchTab(item.key)"
          >
            {{ item.label }}
            <span v-if="tab === item.key" class="absolute inset-x-2 h-0.5 rounded-full bg-emerald-500 -bottom-px" />
          </button>
        </div>

        <form class="space-y-3.5" @submit.prevent="submit">
          <!-- 登录 -->
          <template v-if="tab === 'login'">
            <div class="login-input">
              <div class="i-carbon-user text-base text-gray-400" />
              <input
                v-model="loginForm.username"
                type="text"
                autocomplete="username"
                placeholder="请输入账号"
              >
            </div>
            <div class="login-input">
              <div class="i-carbon-locked text-base text-gray-400" />
              <input
                v-model="loginForm.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="请输入密码"
                @keyup.enter="submit"
              >
              <button
                type="button"
                class="shrink-0 text-gray-400 transition hover:text-gray-600"
                :title="showPassword ? '隐藏密码' : '显示密码'"
                @click="showPassword = !showPassword"
              >
                <div :class="showPassword ? 'i-carbon-view-off' : 'i-carbon-view'" class="text-base" />
              </button>
            </div>

            <div class="flex items-center justify-between text-xs">
              <label class="flex cursor-pointer select-none items-center gap-1.5 text-gray-600">
                <input v-model="rememberUsername" type="checkbox" class="h-3.5 w-3.5 rounded accent-emerald-500">
                记住账号
              </label>
              <button type="button" class="text-gray-500 transition hover:text-emerald-600" @click="switchTab('reset')">
                忘记密码?
              </button>
            </div>
          </template>

          <!-- 注册 -->
          <template v-else-if="tab === 'register'">
            <div class="login-input">
              <div class="i-carbon-user text-base text-gray-400" />
              <input v-model="registerForm.username" type="text" placeholder="用户名（3-32 位字母/数字/下划线）">
            </div>
            <div class="login-input">
              <div class="i-carbon-locked text-base text-gray-400" />
              <input v-model="registerForm.password" type="password" placeholder="密码（至少 6 位）">
            </div>
            <div class="login-input" :style="{ borderColor: passwordMismatch ? '#ef4444' : '' }">
              <div class="i-carbon-locked text-base text-gray-400" />
              <input v-model="registerForm.confirm" type="password" placeholder="再次输入密码">
            </div>
            <div>
              <div class="mb-1.5 flex items-center justify-between">
                <span class="text-xs text-gray-600 font-medium">卡密（决定账号有效期）</span>
                <button
                  type="button"
                  class="flex items-center gap-1 text-xs text-emerald-600 font-medium transition disabled:opacity-50"
                  :disabled="claimingCard"
                  @click="handleClaimFreeCard"
                >
                  <div :class="claimingCard ? 'i-svg-spinners-90-ring-with-bg' : 'i-carbon-gift'" />
                  {{ claimingCard ? '领取中…' : '领取免费卡密' }}
                </button>
              </div>
              <div class="login-input font-mono">
                <div class="i-carbon-ticket text-base text-gray-400" />
                <input
                  v-model="registerForm.cardCode"
                  type="text"
                  placeholder="例如 XXXX-XXXX-XXXX-XXXX"
                  @input="scheduleCardPreview"
                >
              </div>
              <div v-if="checkingCard" class="mt-1.5 text-xs text-gray-400">
                正在校验卡密…
              </div>
              <div v-else-if="cardPreview" class="mt-1.5 flex items-center gap-1.5 text-xs" :class="cardPreview.ok ? 'text-green-600' : 'text-red-500'">
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
            <div class="login-input">
              <div class="i-carbon-user text-base text-gray-400" />
              <input v-model="resetForm.username" type="text" placeholder="请输入用户名">
            </div>
            <div class="login-input font-mono">
              <div class="i-carbon-ticket text-base text-gray-400" />
              <input v-model="resetForm.cardCode" type="text" placeholder="曾用卡密（用于验证身份）">
            </div>
            <div v-if="resetStep === 2" class="login-input">
              <div class="i-carbon-locked text-base text-gray-400" />
              <input v-model="resetForm.newPassword" type="password" placeholder="新密码（至少 6 位）">
            </div>
          </template>

          <button
            type="submit"
            :disabled="!canSubmit"
            class="bg-gradient-primary w-full rounded-xl py-2.5 text-sm text-white font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
          >
            <span v-if="loading" class="i-svg-spinners-90-ring-with-bg align-middle" />
            <span v-else class="inline-flex items-center justify-center gap-1.5">
              <div v-if="tab === 'login'" class="i-carbon-login" />
              {{ tab === 'login' ? '登录' : tab === 'register' ? '注册并激活' : resetStep === 1 ? '验证身份' : '重置密码' }}
            </span>
          </button>
        </form>

        <!-- 快捷入口 -->
        <div class="mt-6">
          <div class="flex items-center gap-2 text-[11px] text-gray-400">
            <span class="h-px flex-1 bg-gray-200" />
            快捷入口
            <span class="h-px flex-1 bg-gray-200" />
          </div>
          <div class="grid grid-cols-3 mt-3 gap-2">
            <button type="button" class="quick-entry" @click="showRenew = true">
              <div class="i-carbon-renew text-lg text-emerald-500" />
              <span>账号续费</span>
            </button>
            <button type="button" class="quick-entry" @click="showUpdateLog = true">
              <div class="i-carbon-document text-lg text-emerald-500" />
              <span>更新日志</span>
            </button>
            <a class="quick-entry" :href="GITHUB_URL" target="_blank" rel="noopener noreferrer" title="GitHub 开源地址">
              <div class="i-carbon-logo-github text-lg text-emerald-500" />
              <span>GitHub</span>
            </a>
          </div>
        </div>

        <p v-if="tab === 'login'" class="mt-5 text-center text-xs text-gray-500">
          还没有账号？
          <button type="button" class="text-emerald-600 font-medium transition hover:text-emerald-700" @click="switchTab('register')">
            立即注册
          </button>
        </p>
        <p v-else class="mt-5 text-center text-xs text-gray-500">
          已有账号？
          <button type="button" class="text-emerald-600 font-medium transition hover:text-emerald-700" @click="switchTab('login')">
            返回登录
          </button>
        </p>

        <p class="mt-3 text-center text-[11px] text-gray-400">
          当前版本 v{{ APP_VERSION }}
        </p>
      </div>
    </div>

    <UpdateLogModal :show="showUpdateLog" @close="showUpdateLog = false" />
    <LoginRenewModal
      :show="showRenew"
      :default-username="loginForm.username"
      @close="showRenew = false"
      @done="handleRenewDone"
    />
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
}

.login-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: url('/backgrounds/pc-login-bg.jpg') center / cover no-repeat;
  transform: scale(1.02);
}

/* 轻微压暗边缘，保证卡片文字可读 */
.login-bg-mask {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(circle at 22% 30%, rgba(255, 255, 255, 0.18), transparent 55%),
    linear-gradient(90deg, rgba(12, 30, 20, 0.18), rgba(12, 30, 20, 0.02) 45%, rgba(12, 30, 20, 0.22));
}

/* 左上角品牌区：桌面端固定贴左上角，不再随卡片垂直居中 */
.login-brand {
  position: absolute;
  top: clamp(20px, 5vh, 52px);
  left: clamp(20px, 3.5vw, 64px);
  z-index: 2;
  pointer-events: none;
}

.login-card {
  border: 1px solid rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 24px 60px rgba(15, 45, 30, 0.22);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.login-input {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 14px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 14px;
  background: rgba(249, 250, 251, 0.9);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.login-input:focus-within {
  border-color: rgba(34, 197, 94, 0.6);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.12);
}

.login-input input {
  width: 100%;
  min-width: 0;
  border: none;
  background: transparent;
  color: #1f2937;
  font-size: 0.875rem;
  outline: none;
}

.login-input input::placeholder {
  color: #9ca3af;
}

.quick-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  border: 1px solid rgba(15, 23, 42, 0.07);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.7);
  color: #4b5563;
  font-size: 0.75rem;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s ease;
}

.quick-entry:hover {
  border-color: rgba(34, 197, 94, 0.35);
  background: #fff;
  color: #15803d;
  transform: translateY(-1px);
}

@media (max-width: 768px) {
  .login-bg {
    background: url('/backgrounds/mobile-login-bg.jpg') center / cover no-repeat;
  }

  .login-bg-mask {
    background: linear-gradient(180deg, rgba(12, 30, 20, 0.12), rgba(12, 30, 20, 0.28));
  }
}
</style>
