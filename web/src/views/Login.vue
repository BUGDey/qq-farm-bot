<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import LoginModals from '@/components/login/LoginModals.vue'
import PasswordStrengthMeter from '@/components/login/PasswordStrengthMeter.vue'
import UpdateLogModal from '@/components/login/UpdateLogModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { getPasswordStrength } from '@/composables/usePasswordStrength'
import { useAppStore } from '@/stores/app'
import { formatTimeDuration, useUserStore } from '@/stores/user'

const USERNAME_RE = /^\w+$/

const userStore = useUserStore()
const appStore = useAppStore()
const route = useRoute()
const gameVersion = ref('')
const loginLinks = computed(() => appStore.loginPageConfig)
const showUpdateLog = ref(false)
const logoLoadFailed = ref(false)

const isLogin = ref(true)
const username = ref('')
const password = ref('')
const cardCode = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)
const showPasswordStrength = ref(false)
const lockoutRemaining = ref(0)
const rateLimitRemaining = ref(0)
const routeUsername = computed(() => String(route.query.username || '').trim())

const cardClaimEnabled = ref(false)
const cardClaimLoading = ref(false)
const showClaimModal = ref(false)
const claimModalContent = ref({
  success: true,
  title: '',
  message: '',
  cardCode: '',
  days: 0,
})

const showResetVerifyModal = ref(false)
const showResetPasswordModal = ref(false)
const resetUsername = ref('')
const resetCardCode = ref('')
const resetNewPassword = ref('')
const resetConfirmPassword = ref('')
const resetError = ref('')
const resetLoading = ref(false)
const resetPasswordTouched = ref(false)

const showRenewalModal = ref(false)
const renewalUsername = ref('')
const renewalCardCode = ref('')
const renewalError = ref('')
const renewalSuccess = ref('')
const renewalLoading = ref(false)

const passwordStrength = computed(() => {
  return getPasswordStrength(password.value)
})

const resetPasswordStrength = computed(() => {
  return getPasswordStrength(resetNewPassword.value)
})

const usernameValid = computed(() => {
  const name = username.value
  if (!name)
    return { valid: false, message: '' }
  if (name.length < 3)
    return { valid: false, message: '用户名至少3位' }
  if (name.length > 32)
    return { valid: false, message: '用户名最多32位' }
  if (!USERNAME_RE.test(name))
    return { valid: false, message: '只能包含字母、数字、下划线' }
  return { valid: true, message: '' }
})

watch(password, () => {
  if (!isLogin.value && password.value) {
    showPasswordStrength.value = true
  }
})

watch(routeUsername, (value) => {
  if (value && !username.value.trim()) {
    username.value = value
  }
}, { immediate: true })

watch(() => loginLinks.value.logoUrl, () => {
  logoLoadFailed.value = false
})

function validateForm(): boolean {
  if (!username.value) {
    error.value = '请输入用户名'
    return false
  }

  if (!usernameValid.value.valid) {
    error.value = usernameValid.value.message
    return false
  }

  if (!password.value) {
    error.value = '请输入密码'
    return false
  }

  if (!isLogin.value) {
    if (password.value.length < 6) {
      error.value = '密码长度至少6位'
      return false
    }

    if (!passwordStrength.value.valid) {
      error.value = '密码强度不足：需包含大写字母、小写字母、数字、特殊符号中的至少两种'
      return false
    }

    if (!cardCode.value) {
      error.value = '请输入卡密'
      return false
    }
  }

  return true
}

async function handleSubmit() {
  if (!validateForm())
    return

  loading.value = true
  error.value = ''
  success.value = ''

  try {
    if (isLogin.value) {
      const result = await userStore.login(username.value, password.value)
      if (result.ok) {
        if (result.data?.mustChangePassword) {
          success.value = '登录成功！请修改默认密码以确保账户安全'
        }
        setTimeout(() => {
          window.location.href = '/'
        }, 500)
      }
      else {
        if (result.errorType === 'rate_limit') {
          error.value = result.error || '请求过于频繁，请稍后重试'
          if (result.remainingMs) {
            rateLimitRemaining.value = Math.ceil(result.remainingMs / 1000)
          }
        }
        else if (result.errorType === 'locked') {
          error.value = result.error || '账户已被锁定'
          if (result.remainingMs) {
            lockoutRemaining.value = Math.ceil(result.remainingMs / 1000 / 60)
          }
        }
        else {
          error.value = result.error || '登录失败'
        }
      }
    }
    else {
      const result = await userStore.register(username.value, password.value, cardCode.value)
      if (result.ok) {
        success.value = '注册成功，请登录'
        isLogin.value = true
        cardCode.value = ''
        password.value = ''
      }
      else {
        error.value = result.error || '注册失败'
      }
    }
  }
  catch (e: any) {
    const data = e.response?.data
    if (data?.errorType === 'rate_limit') {
      error.value = data.error || '请求过于频繁'
      if (data.remainingMs) {
        rateLimitRemaining.value = Math.ceil(data.remainingMs / 1000)
      }
    }
    else if (data?.errorType === 'locked') {
      error.value = data.error || '账户已被锁定'
      if (data.remainingMs) {
        lockoutRemaining.value = Math.ceil(data.remainingMs / 1000 / 60)
      }
    }
    else {
      error.value = data?.error || e.message || '操作异常'
    }
  }
  finally {
    loading.value = false
  }
}

function toggleMode() {
  isLogin.value = !isLogin.value
  error.value = ''
  success.value = ''
  showPasswordStrength.value = false
  lockoutRemaining.value = 0
  rateLimitRemaining.value = 0
}

function openRenewal() {
  renewalUsername.value = username.value.trim()
  renewalCardCode.value = ''
  renewalError.value = ''
  renewalSuccess.value = ''
  showRenewalModal.value = true
}

function closeRenewalModal() {
  if (renewalLoading.value)
    return
  showRenewalModal.value = false
  renewalError.value = ''
  renewalSuccess.value = ''
}

async function submitRenewal() {
  if (!renewalUsername.value.trim()) {
    renewalError.value = '请输入用户名'
    return
  }
  if (!renewalCardCode.value.trim()) {
    renewalError.value = '请输入卡密'
    return
  }

  renewalLoading.value = true
  renewalError.value = ''
  renewalSuccess.value = ''
  try {
    const { data } = await api.post('/api/public/renew', {
      username: renewalUsername.value.trim(),
      cardCode: renewalCardCode.value.trim(),
    })
    if (!data.ok) {
      renewalError.value = data.error || '续费失败'
      return
    }

    const cardType = data.data?.cardType
    const card = data.data?.card
    renewalSuccess.value = cardType === 'quota'
      ? '续费成功，账号额度已更新'
      : `续费成功，有效期已更新${card?.expiresAt ? `至 ${new Date(card.expiresAt).toLocaleString('zh-CN')}` : ''}`
    username.value = renewalUsername.value.trim()
  }
  catch (e: any) {
    renewalError.value = e?.response?.data?.error || e?.message || '续费失败'
  }
  finally {
    renewalLoading.value = false
  }
}

function openResetVerifyModal() {
  resetUsername.value = username.value.trim()
  resetCardCode.value = ''
  resetNewPassword.value = ''
  resetConfirmPassword.value = ''
  resetError.value = ''
  resetPasswordTouched.value = false
  showResetVerifyModal.value = true
}

function closeResetVerifyModal() {
  if (resetLoading.value)
    return
  showResetVerifyModal.value = false
  resetError.value = ''
}

function closeResetPasswordModal() {
  if (resetLoading.value)
    return
  showResetPasswordModal.value = false
  resetNewPassword.value = ''
  resetConfirmPassword.value = ''
  resetError.value = ''
  resetPasswordTouched.value = false
}

async function verifyResetPassword() {
  if (!resetUsername.value.trim()) {
    resetError.value = '请输入用户名'
    return
  }
  if (!resetCardCode.value.trim()) {
    resetError.value = '请输入注册时使用的卡密'
    return
  }

  resetLoading.value = true
  resetError.value = ''
  try {
    const result = await userStore.verifyResetPassword(resetUsername.value.trim(), resetCardCode.value.trim())
    if (!result.ok) {
      resetError.value = result.error || '验证失败'
      return
    }
    showResetVerifyModal.value = false
    showResetPasswordModal.value = true
  }
  catch (e: any) {
    resetError.value = e?.response?.data?.error || e?.message || '验证失败'
  }
  finally {
    resetLoading.value = false
  }
}

async function submitResetPassword() {
  resetPasswordTouched.value = true
  if (!resetNewPassword.value) {
    resetError.value = '请输入新密码'
    return
  }
  if (resetNewPassword.value.length < 6) {
    resetError.value = '密码长度至少6位'
    return
  }
  if (!resetPasswordStrength.value.valid) {
    resetError.value = '密码强度不足：需包含大写字母、小写字母、数字、特殊符号中的至少两种'
    return
  }
  if (resetNewPassword.value !== resetConfirmPassword.value) {
    resetError.value = '两次输入的密码不一致'
    return
  }

  resetLoading.value = true
  resetError.value = ''
  try {
    const result = await userStore.resetPassword(
      resetUsername.value.trim(),
      resetCardCode.value.trim(),
      resetNewPassword.value,
    )
    if (!result.ok) {
      resetError.value = result.error || '重置失败'
      return
    }
    showResetPasswordModal.value = false
    username.value = resetUsername.value.trim()
    password.value = ''
    isLogin.value = true
    success.value = '密码重置成功，请使用新密码登录'
    resetNewPassword.value = ''
    resetConfirmPassword.value = ''
  }
  catch (e: any) {
    resetError.value = e?.response?.data?.error || e?.message || '重置失败'
  }
  finally {
    resetLoading.value = false
  }
}

async function checkCardClaimStatus() {
  try {
    const res = await api.get('/api/card-claim/status')
    if (res.data.ok) {
      cardClaimEnabled.value = res.data.enabled === true
    }
  }
  catch (e) {
    console.error('检查卡密领取状态失败:', e)
  }
}

async function claimFreeCard() {
  if (cardClaimLoading.value)
    return

  cardClaimLoading.value = true
  error.value = ''

  try {
    const res = await api.post('/api/card-claim/claim')

    if (res.data.ok) {
      cardCode.value = res.data.cardCode
      claimModalContent.value = {
        success: true,
        title: '领取成功',
        message: `成功领取 ${formatTimeDuration(res.data)}卡密！`,
        cardCode: res.data.cardCode,
        days: res.data.days,
      }
      showClaimModal.value = true
    }
    else {
      claimModalContent.value = {
        success: false,
        title: '领取失败',
        message: res.data.error || '领取失败，请稍后重试',
        cardCode: '',
        days: 0,
      }
      showClaimModal.value = true
    }
  }
  catch (e: any) {
    const data = e.response?.data
    claimModalContent.value = {
      success: false,
      title: '领取失败',
      message: data?.error || e.message || '领取失败',
      cardCode: '',
      days: 0,
    }
    showClaimModal.value = true
  }
  finally {
    cardClaimLoading.value = false
  }
}

function closeClaimModal() {
  showClaimModal.value = false
}

onMounted(() => {
  checkCardClaimStatus()
  fetchGameVersion()
  appStore.fetchLoginPageConfig()
})

async function fetchGameVersion() {
  try {
    const res = await api.get('/api/game-version')
    if (res.data.ok) {
      gameVersion.value = res.data.clientVersion
    }
  }
  catch (e) {
    console.error('获取游戏版本失败:', e)
  }
}
</script>

<template>
  <div class="login-container">
    <!-- ===== 动画背景装饰层 ===== -->
    <div class="bg-decoration" aria-hidden="true">
      <!-- 天空渐变 -->
      <div class="sky-gradient" />
      
      <!-- 太阳（脉动发光） -->
      <div class="sun-decoration">
        <div class="sun-core" />
        <div class="sun-glow-1" />
        <div class="sun-glow-2" />
      </div>
      
      <!-- 漂浮云朵 -->
      <div class="cloud cloud-1" />
      <div class="cloud cloud-2" />
      <div class="cloud cloud-3" />
      
      <!-- 漂浮粒子（晨光中的尘埃） -->
      <div class="particle particle-1" />
      <div class="particle particle-2" />
      <div class="particle particle-3" />
      <div class="particle particle-4" />
      <div class="particle particle-5" />
      <div class="particle particle-6" />
      
    </div>

    <!-- ===== 登录卡片（带入场动画） ===== -->
    <main class="login-card">
      <!-- 卡片顶部装饰光晕 -->
      <div class="card-glow" />
      
      <!-- Logo 区域（带呼吸光环） -->
      <div class="logo-area">
        <div class="logo-icon-wrapper">
          <div class="logo-ring-1" />
          <div class="logo-ring-2" />
          <div class="logo-icon">
            <img
              v-if="loginLinks.logoUrl && !logoLoadFailed"
              :src="loginLinks.logoUrl"
              :alt="`${loginLinks.title || 'QQ农场智能助手'}图标`"
              class="logo-image"
              @error="logoLoadFailed = true"
            >
            <div v-else class="i-carbon-sprout text-3xl" />
          </div>
        </div>
        <h1 class="logo-title">
          {{ loginLinks.title || 'QQ农场智能助手' }}
        </h1>
        <p class="logo-subtitle">
          {{ isLogin
            ? (loginLinks.loginSubtitle || '欢迎回来，开启智慧农耕之旅')
            : (loginLinks.registerSubtitle || '创建账号，开启智慧农耕之旅') }}
        </p>
      </div>

      <!-- 表单区域 -->
      <form class="form-area" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label class="form-label">
            <span class="label-icon i-carbon-user" />
            用户名
          </label>
          <div class="input-wrapper">
            <span class="input-icon i-carbon-user" />
            <BaseInput
              id="username"
              v-model="username"
              type="text"
              placeholder="请输入用户名"
              required
            />
          </div>
          <p v-if="username && !usernameValid.valid" class="form-hint error">
            {{ usernameValid.message }}
          </p>
        </div>

        <div class="form-group">
          <label class="form-label">
            <span class="label-icon i-carbon-password" />
            密码
          </label>
          <div class="input-wrapper">
            <span class="input-icon i-carbon-password" />
            <BaseInput
              id="password"
              v-model="password"
              type="password"
              placeholder="请输入密码"
              required
            />
          </div>
          <PasswordStrengthMeter
            v-if="showPasswordStrength && password"
            :strength="passwordStrength"
            compact
          />
          
          <!-- 消息动画容器 -->
          <Transition name="msg-slide">
            <div v-if="error" class="message error-message" :key="'error-'+error">
              <span class="message-icon i-carbon-warning" />
              <div class="message-content">
                {{ error }}
                <span v-if="lockoutRemaining > 0" class="lockout-timer">
                  ({{ lockoutRemaining }} 分钟后解锁)
                </span>
                <span v-if="rateLimitRemaining > 0" class="lockout-timer">
                  ({{ rateLimitRemaining }} 秒后可重试)
                </span>
              </div>
            </div>
          </Transition>
          <Transition name="msg-slide">
            <div v-if="success" class="message success-message" :key="'success-'+success">
              <span class="message-icon i-carbon-checkmark-filled" />
              {{ success }}
            </div>
          </Transition>
        </div>

        <div v-if="!isLogin" class="form-group">
          <label class="form-label">
            <span class="label-icon i-carbon-ticket" />
            卡密
          </label>

          <div v-if="cardClaimEnabled" class="mb-2">
            <button
              type="button"
              class="claim-card-btn"
              :disabled="cardClaimLoading"
              @click="claimFreeCard"
            >
              <span v-if="cardClaimLoading" class="i-svg-spinners-90-ring-with-bg" />
              <span v-else>
                <span class="sparkle-icon">✦</span>
                免费领取卡密
              </span>
            </button>
          </div>

          <div class="input-wrapper">
            <span class="input-icon i-carbon-ticket" />
            <BaseInput
              id="cardCode"
              v-model="cardCode"
              type="text"
              placeholder="请输入卡密"
              :required="!isLogin"
            />
          </div>
        </div>

        <BaseButton
          type="submit"
          variant="primary"
          block
          :loading="loading"
          class="submit-btn"
        >
          <span v-if="!loading" class="submit-text">
            <span class="submit-icon i-carbon-login" />
            {{ isLogin ? '登 录' : '注 册' }}
          </span>
        </BaseButton>
      </form>

      <!-- 模式切换 & 快捷操作 -->
      <div class="switch-area" :class="{ 'single-action': !isLogin }">
        <button
          type="button"
          class="switch-btn"
          @click="toggleMode"
        >
          <span class="switch-btn-icon">{{ isLogin ? '→' : '←' }}</span>
          {{ isLogin ? '没有账号？立即注册' : '已有账号？立即登录' }}
        </button>
        <div v-if="isLogin" class="login-quick-actions">
          <button type="button" class="quick-action-btn" @click="openResetVerifyModal">
            <span class="i-carbon-reset" />
            忘记密码
          </button>
          <button type="button" class="quick-action-btn" @click="openRenewal">
            <span class="i-carbon-renew" />
            账号续费
          </button>
        </div>
      </div>

      <!-- 底部链接 -->
      <div class="card-footer">
        <div class="footer-info">
          <a
            v-if="loginLinks.purchaseUrl"
            :href="loginLinks.purchaseUrl"
            class="footer-link purchase-link"
          >
            <span class="i-carbon-shopping-cart" />
            购买卡密
          </a>
          <a
            v-if="loginLinks.qqGroupUrl"
            :href="loginLinks.qqGroupUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="footer-link qq-group-link"
          >
            <span class="i-carbon-logo-qq" />
            加入QQ群
          </a>
          <button
            type="button"
            class="footer-link update-log-link"
            @click="showUpdateLog = true"
          >
            <span class="i-carbon-document" />
            更新日志
          </button>
        </div>
        <div v-if="gameVersion" class="game-version">
          当前游戏版本：{{ gameVersion }}
        </div>
      </div>
    </main>

    <LoginModals
      v-model:show-claim-modal="showClaimModal"
      v-model:show-reset-verify-modal="showResetVerifyModal"
      v-model:show-reset-password-modal="showResetPasswordModal"
      v-model:show-renewal-modal="showRenewalModal"
      v-model:reset-username="resetUsername"
      v-model:reset-card-code="resetCardCode"
      v-model:reset-new-password="resetNewPassword"
      v-model:reset-confirm-password="resetConfirmPassword"
      v-model:reset-password-touched="resetPasswordTouched"
      v-model:renewal-username="renewalUsername"
      v-model:renewal-card-code="renewalCardCode"
      :claim-modal-content="claimModalContent"
      :reset-error="resetError"
      :reset-loading="resetLoading"
      :reset-password-strength="resetPasswordStrength"
      :renewal-error="renewalError"
      :renewal-success="renewalSuccess"
      :renewal-loading="renewalLoading"
      @close-claim="closeClaimModal"
      @close-reset-verify="closeResetVerifyModal"
      @close-reset-password="closeResetPasswordModal"
      @close-renewal="closeRenewalModal"
      @verify-reset-password="verifyResetPassword"
      @submit-reset-password="submitResetPassword"
      @submit-renewal="submitRenewal"
    />

    <UpdateLogModal :show="showUpdateLog" @close="showUpdateLog = false" />
  </div>
</template>

<style scoped>
/* =============================================
   登录页 — 田园农场主题 · 增强版
   ============================================= */

/* --- 容器 --- */
.login-container {
  height: 100dvh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
  font-family:
    'Noto Sans SC',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px;
}

@keyframes bg-shift {
  0% { background: linear-gradient(180deg, #070b1f 0%, #141a40 36%, #2a2350 60%, #4b3a6b 80%, #7d5a7e 100%); }
  100% { background: linear-gradient(180deg, #0a0f2c 0%, #1a2150 36%, #322a60 60%, #574a82 80%, #8a6589 100%); }
}

/* --- 背景装饰层（固定钉满视口，滚动始终铺满，不再透出深色底） --- */
.bg-decoration {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
  background: linear-gradient(180deg, #0b1020 0%, #141a40 36%, #2a2350 60%, #4b3a6b 80%, #7d5a7e 100%);
  animation: bg-shift 20s ease-in-out infinite alternate;
}

/* 天空渐变 */
.sky-gradient {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 72%;
  background:
    radial-gradient(1.5px 1.5px at 18% 28%, rgba(255,255,255,0.85) 0, transparent 100%),
    radial-gradient(1px 1px at 42% 18%, rgba(255,255,255,0.55) 0, transparent 100%),
    radial-gradient(1.5px 1.5px at 68% 34%, rgba(255,255,255,0.7) 0, transparent 100%),
    radial-gradient(1px 1px at 84% 22%, rgba(255,255,255,0.5) 0, transparent 100%),
    radial-gradient(1px 1px at 56% 46%, rgba(255,255,255,0.45) 0, transparent 100%),
    radial-gradient(1.5px 1.5px at 30% 52%, rgba(255,255,255,0.6) 0, transparent 100%),
    linear-gradient(180deg, rgba(7,11,31,0) 0%, rgba(20,26,64,0) 100%);
}

/* --- 太阳（三层光晕 + 脉动） --- */
.sun-decoration {
  position: absolute;
  top: 7%;
  right: 12%;
  width: 90px;
  height: 90px;
}

.sun-core {
  position: absolute;
  inset: 22px;
  border-radius: 50%;
  background: radial-gradient(circle, #fdfdfb 0%, #e8eef7 55%, rgba(232,238,247,0) 100%);
  box-shadow: 0 0 26px 6px rgba(210,225,255,0.35);
  animation: sun-pulse 6s ease-in-out infinite;
}

.sun-glow-1 {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(200,220,255,0.25) 0%, transparent 70%);
  animation: sun-glow-soft 8s e-in-out infinite alternate;
}

.sun-glow-2 {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(200,220,255,0.10) 0%, transparent 60%);
  animation: sun-glow-soft 10s ease-in-out infinite alternate-reverse;
}

@keyframes sun-pulse {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.12); opacity: 1; }
}

@keyframes sun-glow-soft {
  0% { opacity: 0.7; transform: scale(1); }
  100% { opacity: 1; transform: scale(1.3); }
}

/* --- 漂浮云朵 --- */
.cloud {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 6px 1px rgba(255,255,255,0.5);
  filter: blur(0.3px);
}

.cloud::before,
.cloud::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: inherit;
  box-shadow: inherit;
}

.cloud-1 {
  width: 3px;
  height: 3px;
  top: 18%;
  left: 30%;
  animation: star-twinkle 3.5s ease-in-out infinite;
}
.cloud-1::before { width: 2px; height: 2px; top: 10px; left: 14px; }
.cloud-1::after { width: 2px; height: 2px; top: 24px; left: -8px; }

.cloud-2 {
  width: 2px;
  height: 2px;
  top: 28%;
  left: 56%;
  animation: star-twinkle 4.5s ease-in-out infinite;
  animation-delay: -1.5s;
}
.cloud-2::before { width: 2px; height: 2px; top: 14px; left: 10px; }
.cloud-2::after { width: 3px; height: 3px; top: -10px; left: 18px; }

.cloud-3 {
  width: 2px;
  height: 2px;
  top: 12%;
  left: 72%;
  animation: star-twinkle 5s ease-in-out infinite;
  animation-delay: -3s;
  opacity: 0.8;
}
.cloud-3::before { width: 3px; height: 3px; top: 18px; left: -10px; }
.cloud-3::after { width: 2px; height: 2px; top: -8px; left: 12px; }

@keyframes star-twinkle {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.25); }
}

/* --- 漂浮粒子（晨光尘埃） --- */
.particle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 240, 150, 0.85);
  box-shadow: 0 0 6px 1px rgba(255, 230, 130, 0.6);
  filter: blur(0.5px);
}

.particle-1 { width: 6px; height: 6px; top: 20%; left: 20%; animation: float-up 12s ease-in-out infinite; }
.particle-2 { width: 4px; height: 4px; top: 30%; left: 70%; animation: float-up 15s ease-in-out infinite reverse; animation-delay: -3s; }
.particle-3 { width: 5px; height: 5px; top: 15%; left: 45%; animation: float-up 10s ease-in-out infinite; animation-delay: -6s; }
.particle-4 { width: 3px; height: 3px; top: 45%; left: 25%; animation: float-up 18s ease-in-out infinite reverse; animation-delay: -8s; }
.particle-5 { width: 7px; height: 7px; top: 25%; left: 85%; animation: float-up 14s ease-in-out infinite; animation-delay: -4s; }
.particle-6 { width: 4px; height: 4px; top: 35%; left: 10%; animation: float-up 11s ease-in-out infinite reverse; animation-delay: -10s; }

@keyframes float-up {
  0%, 100% { transform: translateY(0) translateX(0) scale(1); opacity: 0.3; }
  25% { transform: translateY(-30px) translateX(10px) scale(1.2); opacity: 0.7; }
  50% { transform: translateY(-50px) translateX(-5px) scale(0.9); opacity: 0.5; }
  75% { transform: translateY(-20px) translateX(15px) scale(1.1); opacity: 0.8; }
}

/* =============================================
   登录卡片 — 增强毛玻璃 + 入场动画
   ============================================= */

.login-card {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding: 34px 30px 22px;
  line-height: 1.35;
  background: transparent;
  border: none;
  border-radius: 24px;
  box-shadow: none;
  position: relative;
  z-index: 10;
  animation: card-enter 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
  overflow: visible;
}

@keyframes card-enter {
  0% { opacity: 0; transform: translateY(40px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* 卡片顶部装饰光晕 */
.card-glow {
  position: absolute;
  top: -80px;
  left: 50%;
  transform: translateX(-50%);
  width: 280px;
  height: 160px;
  contextmenu: radial-gradient(ellipse, color-mix(in srgb, #818cf8 24%, transparent) 0%, transparent 70%);
  pointer-events: none;
  opacity: 0.6;
  animation: glow-breathe 5s ease-in-out infinite alternate;
}

@keyframes glow-breathe {
  0% { opacity: 0.4; transform: translateX(-50%) scaleY(0.9); }
  100% { opacity: 0.8; transform: translateX(-50%) scaleY(1.2); }
}

/* --- Logo 区域 --- */
.logo-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 18px;
  position: relative;
  z-index: 1;
}

.logo-icon-wrapper {
  position: relative;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 呼吸光环 */
.logo-ring-1,
.logo-ring-2 {
  position: absolute;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--theme-primary, #22c55e) 25%, transparent);
  animation: ring-pulse 3s ease-out infinite;
}
.logo-ring-1 { width: 94px; height: 94px; }
.logo-ring-2 { width: 110px; height: 110px; animation-delay: 1s; }

@keyframes ring-pulse {
  0% { transform: 0.8); opacity: 0; }
  50% { opacity: 0.6; }
  100% { transform: scale(1.3); opacity: 0; }
}

.logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
  border: 3px solid rgba(102, 187, 106, 0.5);
  border-radius: 50%;
  color: #43a047;
  box-shadow:
    0 8px 24px rgba(102, 187, 106, 0.2),
    0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  position: relative;
  z-index: 1;
  transition: transform 0.3s ease, box-shadow: 0.3s ease;
}

.logo-icon:hover {
  transform: scale(1.05);
  box-shadow:
    0 12px 32px rgba(102, 187, 106, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.7) inset;
}

.logo-title {
  50% { opacity: 1; transform: scale(1.2); }
}

.logo-title {
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1.2;
  margin: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  background: linear-gradient(135deg, #2e7d32, #43a047, #66bb6a);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 0.02em;
}

.logo-subtitle {
  color: #94a3b8;
  font-size: 0.82rem;
  line-height: 1.3;
  margin: 6px 0 0;
  max-width: 100%;
  .login-card,
  .submit-btn,
  .switch-btn,
  .quick-action-btn,
  .cloud,
  .particle,
  .sun-core,
  .sun-glow-1,
  .sun-glow-2,
  .card-glow,
  .logo-ring-1,
  .logo-ring-2,
  .sparkle-icon {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
