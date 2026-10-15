<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import axios from 'axios'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useToastStore } from '@/stores/toast'

const router = useRouter()
const toastStore = useToastStore()

// 预加载登录页与主页背景图，避免登录成功跳转后背景短暂空白
// 只预加载当前设备的背景，避免重复下载另一端的图片
onMounted(() => {
  const isMobile = window.matchMedia('(max-width: 768px)').matches
  const bgList = isMobile
    ? ['/backgrounds/mobile-login-bg.jpg', '/backgrounds/mobile-dashboard-bg.jpg']
    : ['/backgrounds/pc-login-bg.jpg', '/backgrounds/pc-dashboard-bg.jpg']
  for (const src of bgList) {
    const img = new Image()
    img.src = src
  }
})

const username = ref('')
const password = ref('')
const loading = ref(false)

const adminToken = useStorage('admin_token', '')

async function handleLogin() {
  if (!username.value || !password.value) {
    toastStore.error('请输入用户名和密码')
    return
  }

  loading.value = true
  try {
    const { data } = await axios.post('/api/login', {
      username: username.value,
      password: password.value,
    })

    if (data?.ok) {
      adminToken.value = data.data.token
      toastStore.success('登录成功')
      router.push('/')
    }
    else {
      toastStore.error(data?.error || '登录失败')
    }
  }
  catch (error: any) {
    const message = error?.response?.data?.error || error?.message || '登录失败'
    toastStore.error(message)
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <!-- Background Image -->
    <div class="login-bg" />

    <!-- Top Brand Bar -->
    <div class="top-brand-bar">
      <div class="brand-block">
        <div class="brand-title">
          <span class="brand-leaf i-fas-leaf" />
          <span class="brand-text">QQ农场</span>
        </div>
        <div class="brand-tagline">
          种下希望 收获快乐
        </div>
      </div>
      <div class="register-top">
        <span>还没有账号？</span>
        <a href="javascript:void(0)">立即注册 &gt;</a>
      </div>
    </div>

    <!-- Login Panel -->
    <div class="login-panel">
      <!-- Panel Header -->
      <div class="panel-header">
        <div class="panel-logo">
          <div class="i-fas-leaf text-xl text-white" />
        </div>
        <div class="panel-brand">
          QQ农场
        </div>
      </div>

      <!-- Welcome -->
      <div class="welcome">
        <h1>欢迎回来</h1>
        <p>登录后开启你的农场之旅</p>
      </div>

      <!-- Form -->
      <form class="login-form" @submit.prevent="handleLogin">
        <!-- QQ Input -->
        <div class="field">
          <div class="field-icon">
            <div class="field-icon-svg i-fab-qq" />
          </div>
          <BaseInput
            v-model="username"
            placeholder="请输入账号"
            autocomplete="username"
            class="field-input"
          />
          <div class="field-chevron">
            <div class="i-carbon-chevron-right text-base text-gray-300" />
          </div>
        </div>

        <!-- Password Input -->
        <div class="field">
          <div class="field-icon">
            <div class="field-icon-svg i-carbon-locked" />
          </div>
          <BaseInput
            v-model="password"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
            class="field-input"
          />
        </div>

        <!-- Options -->
        <div class="options">
          <label class="remember">
            <input type="checkbox" class="remember-box">
            <span>记住账号</span>
          </label>
          <a class="forgot" href="javascript:void(0)">忘记密码?</a>
        </div>

        <!-- Login Button -->
        <button
          type="submit"
          class="login-btn"
          :disabled="loading"
        >
          <div v-if="loading" class="i-svg-spinners-ring-resize mr-2 text-base" />
          <div v-else class="i-carbon-login mr-2 text-base" />
          登录
        </button>
      </form>

      <!-- Divider -->
      <div class="divider">
        <span>其他登录方式</span>
      </div>

      <!-- Alt Login -->
      <div class="alt-row">
        <button class="alt-btn" type="button">
          <div class="alt-circle alt-qq">
            <div class="i-fab-qq text-xl text-sky-500" />
          </div>
          <span class="alt-text">QQ登录</span>
        </button>
        <button class="alt-btn" type="button">
          <div class="alt-circle alt-wechat">
            <div class="i-fab-weixin text-xl text-emerald-500" />
          </div>
          <span class="alt-text">微信登录</span>
        </button>
        <button class="alt-btn" type="button">
          <div class="alt-circle alt-sms">
            <div class="i-carbon-mobile text-lg text-blue-500" />
          </div>
          <span class="alt-text">验证码登录</span>
        </button>
      </div>

      <!-- Footer -->
      <div class="footer">
        <span>还没有账号？</span>
        <a href="javascript:void(0)">立即注册 ></a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

/* Background */
.login-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: url('/backgrounds/pc-login-bg.jpg') center/cover no-repeat;
}

/* Mobile Background Override */
@media (max-width: 768px) {
  .login-bg {
    background: url('/backgrounds/mobile-login-bg.jpg') center/cover no-repeat;
  }
}

/* Top Brand Bar (mobile only) */
.top-brand-bar {
  display: none;
  position: relative;
  z-index: 10;
}

/* Login Panel */
.login-panel {
  position: relative;
  z-index: 10;
  width: 380px;
  max-width: calc(100% - 80px);
  margin-right: 6%;
  padding: 40px 36px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px rgba(31, 110, 140, 0.15);
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Panel Header */
.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.panel-logo {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00d26a 0%, #0099ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 210, 106, 0.3);
}

.panel-brand {
  font-size: 20px;
  font-weight: 700;
  color: #2c3e50;
  letter-spacing: 0.02em;
}

/* Welcome */
.welcome {
  text-align: center;
  margin-bottom: 24px;
}

.welcome h1 {
  font-size: 28px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 8px;
  letter-spacing: 0.03em;
}

.welcome p {
  font-size: 13px;
  color: #7f8c8d;
}

/* Form */
.login-form {
  width: 100%;
}

/* Input Field：白色胶囊 */
.field {
  position: relative;
  display: flex;
  align-items: center;
  height: 54px;
  margin-bottom: 14px;
}

.field-icon {
  position: absolute;
  left: 20px;
  z-index: 5;
  display: flex;
  pointer-events: none;
}

.field-icon-svg {
  font-size: 20px;
  color: #334155;
}

.field-chevron {
  position: absolute;
  right: 20px;
  z-index: 5;
  display: flex;
  pointer-events: none;
}

/* 调整 BaseInput 自带眼睛按钮的位置与大小，对齐设计稿 */
.field-input :deep(button) {
  right: 20px;
  display: flex;
}

.field-input :deep(.i-carbon-view),
.field-input :deep(.i-carbon-view-off) {
  width: 20px;
  height: 20px;
}

.field-input {
  width: 100%;
}

.field-input :deep(input) {
  width: 100% !important;
  height: 54px !important;
  padding-left: 50px !important;
  padding-right: 50px !important;
  border: none !important;
  border-radius: 999px !important;
  background: #fff !important;
  box-shadow: 0 2px 10px rgba(31, 110, 140, 0.08) !important;
  font-size: 15px !important;
  color: #2c3e50 !important;
  transition: box-shadow 0.3s ease !important;
}

.field-input :deep(input::placeholder) {
  color: #9ca3af !important;
}

.field-input :deep(input:focus) {
  outline: none !important;
  box-shadow:
    0 0 0 2px rgba(34, 197, 94, 0.45),
    0 2px 10px rgba(31, 110, 140, 0.08) !important;
}

/* Options */
.options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  font-size: 14px;
}

.remember {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  color: #4b5563;
}

.remember-box {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  accent-color: #10b981;
  cursor: pointer;
}

.forgot {
  color: #4b5563;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.forgot:hover {
  opacity: 0.7;
}

/* Login Button：绿→蓝渐变胶囊 */
.login-btn {
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(90deg, #34d399 0%, #22c55e 45%, #3b82f6 100%);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.08em;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.5),
    0 6px 18px rgba(16, 185, 129, 0.35);
}

.login-btn:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.5),
    0 8px 22px rgba(16, 185, 129, 0.4);
}

.login-btn:active {
  transform: translateY(0);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Divider */
.divider {
  width: 100%;
  display: flex;
  align-items: center;
  margin: 24px 0 20px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e8e8e8;
}

.divider span {
  padding: 0 16px;
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}

/* Alt Login */
.alt-row {
  display: flex;
  justify-content: center;
  gap: 40px;
  margin-bottom: 24px;
}

.alt-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  cursor: pointer;
  transition: transform 0.2s;
}

.alt-btn:hover {
  transform: translateY(-2px);
}

.alt-circle {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 12px rgba(31, 110, 140, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.alt-text {
  font-size: 12px;
  color: #7f8c8d;
}

/* Footer */
.footer {
  text-align: center;
  font-size: 14px;
}

.footer span {
  color: #7f8c8d;
}

.footer a {
  color: #3498db;
  text-decoration: none;
  font-weight: 500;
}

.footer a:hover {
  opacity: 0.7;
}

/* Mobile */
@media (max-width: 768px) {
  .login-page {
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    height: 100dvh;
    overflow-y: auto;
  }

  /* 顶部：左上 Logo，右上注册入口 */
  .top-brand-bar {
    display: flex;
    width: 100%;
    align-items: flex-start;
    justify-content: space-between;
    padding: 52px 24px 0;
  }

  .brand-block {
    display: flex;
    flex-direction: column;
  }

  .brand-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-leaf {
    font-size: 30px;
    color: #fff;
    filter: drop-shadow(0 3px 5px rgba(23, 78, 122, 0.35));
  }

  .brand-text {
    font-size: 36px;
    font-weight: 900;
    font-style: italic;
    color: #fff;
    letter-spacing: 2px;
    text-shadow:
      0 3px 0 rgba(30, 84, 132, 0.65),
      0 6px 14px rgba(30, 84, 132, 0.55),
      0 10px 26px rgba(30, 84, 132, 0.45);
  }

  .brand-tagline {
    margin-top: 2px;
    padding-left: 42px;
    font-size: 15px;
    font-weight: 600;
    font-style: italic;
    color: rgba(255, 255, 255, 0.98);
    letter-spacing: 0.22em;
    text-shadow:
      0 2px 0 rgba(30, 84, 132, 0.6),
      0 4px 12px rgba(30, 84, 132, 0.5);
  }

  .register-top {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    padding-top: 10px;
    font-size: 13px;
    line-height: 1.5;
    text-align: right;
    color: rgba(255, 255, 255, 0.95);
    text-shadow:
      0 2px 0 rgba(30, 84, 132, 0.55),
      0 3px 10px rgba(30, 84, 132, 0.5);
  }

  .register-top a {
    color: #fff;
    font-weight: 600;
    font-size: 15px;
    text-decoration: none;
  }

  /* 登录卡：白色磨砂大圆角，左对齐 */
  .login-panel {
    width: calc(100% - 32px);
    max-width: 420px;
    margin: 26px 0 36px;
    padding: 28px 24px 30px;
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 14px 40px rgba(31, 110, 140, 0.18);
    align-items: stretch;
  }

  .panel-header {
    display: none;
  }

  .welcome {
    text-align: left;
    margin-bottom: 20px;
  }

  .welcome h1 {
    font-size: 26px;
    color: #1f2937;
    margin-bottom: 6px;
  }

  .welcome p {
    font-size: 14px;
    color: #6b7280;
  }

  .footer {
    display: none;
  }
}

/* Desktop: show register top right */
@media (min-width: 769px) {
  .top-brand-bar {
    display: flex;
    position: absolute;
    top: 30px;
    left: 40px;
    right: 40px;
    z-index: 10;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0;
  }

  .brand-block {
    display: flex;
    flex-direction: column;
  }

  .brand-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .brand-leaf {
    font-size: 24px;
    color: #fff;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25));
  }

  .brand-text {
    font-size: 28px;
    font-weight: 900;
    font-style: italic;
    color: #fff;
    letter-spacing: 2px;
    text-shadow:
      0 2px 0 rgba(30, 84, 132, 0.6),
      0 5px 14px rgba(30, 84, 132, 0.5),
      0 10px 24px rgba(30, 84, 132, 0.4);
  }

  .brand-tagline {
    margin-top: 2px;
    padding-left: 34px;
    font-size: 13px;
    font-weight: 600;
    font-style: italic;
    color: rgba(255, 255, 255, 0.95);
    letter-spacing: 0.2em;
    text-shadow:
      0 2px 0 rgba(30, 84, 132, 0.55),
      0 4px 12px rgba(30, 84, 132, 0.5);
  }

  .register-top {
    padding-top: 8px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .register-top a {
    color: #fff;
    font-weight: 500;
    text-decoration: none;
  }
}
</style>
