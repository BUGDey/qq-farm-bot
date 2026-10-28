<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import api from '@/api'

const props = defineProps<{
  show: boolean
  /** 默认带入登录框里的账号，用户再来续费时不用重复输入 */
  defaultUsername?: string
}>()

const emit = defineEmits<{
  close: []
  /** 续费成功后把账号回填到登录框 */
  done: [username: string]
}>()

interface AccountStatus {
  exists: boolean
  username: string
  isExpired?: boolean
  isPermanent?: boolean
  expiresAtText?: string
  remainingText?: string
  accountLimit?: number
}

const username = ref('')
const cardCode = ref('')
const submitting = ref(false)
const checking = ref(false)
const status = ref<AccountStatus | null>(null)
const statusError = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const successDetail = ref('')

let statusTimer: ReturnType<typeof setTimeout> | null = null

const canSubmit = computed(() => !!username.value.trim() && !!cardCode.value.trim() && !submitting.value)

const statusText = computed(() => {
  if (checking.value)
    return '正在查询账号状态…'
  if (statusError.value)
    return statusError.value
  if (!status.value)
    return ''
  if (!status.value.exists)
    return `账号「${status.value.username}」不存在，请检查输入`
  if (status.value.isPermanent)
    return '该账号当前为永久有效，续费后仍保持永久有效'
  if (status.value.isExpired)
    return `该账号已过期（原到期时间 ${status.value.expiresAtText || '-'}），核销后从现在重新起算`
  return `有效期至 ${status.value.expiresAtText || '-'}，核销后顺延`
})

const statusTone = computed(() => {
  if (!status.value?.exists || statusError.value)
    return 'text-red-500'
  if (status.value.isExpired)
    return 'text-amber-600'
  return 'text-emerald-600'
})

function reset() {
  username.value = props.defaultUsername || ''
  cardCode.value = ''
  submitting.value = false
  checking.value = false
  status.value = null
  statusError.value = ''
  errorMessage.value = ''
  successMessage.value = ''
  successDetail.value = ''
  if (username.value.trim())
    scheduleStatusCheck()
}

async function checkStatus() {
  const name = username.value.trim()
  status.value = null
  statusError.value = ''
  if (!name) {
    checking.value = false
    return
  }
  checking.value = true
  try {
    const { data } = await api.get('/api/public/account-status', { params: { username: name } })
    if (data?.ok)
      status.value = data.data
    else
      statusError.value = data?.error || '查询账号状态失败'
  }
  catch (error: any) {
    statusError.value = error?.response?.data?.error || error?.message || '查询账号状态失败'
  }
  finally {
    checking.value = false
  }
}

function scheduleStatusCheck() {
  if (statusTimer)
    clearTimeout(statusTimer)
  statusTimer = setTimeout(checkStatus, 400)
}

async function submit() {
  if (!canSubmit.value)
    return
  errorMessage.value = ''
  successMessage.value = ''
  successDetail.value = ''
  submitting.value = true
  try {
    const { data } = await api.post('/api/public/renew', {
      username: username.value.trim(),
      cardCode: cardCode.value.trim(),
    })
    if (!data?.ok) {
      errorMessage.value = data?.error || '核销失败'
      return
    }
    const result = data.data || {}
    const subscription = result.subscription || {}
    const expiresAtText = subscription.isPermanent
      ? '永久有效'
      : subscription.expiresAt
        ? new Date(subscription.expiresAt).toLocaleString('zh-CN', { hour12: false })
        : '已生效'
    successMessage.value = `核销成功：${result.summary || '已生效'}`
    const parts: string[] = [`有效期：${expiresAtText}`]
    if (typeof result.accountLimit === 'number')
      parts.push(`账号额度：${result.accountLimit < 0 ? '不限' : `${result.accountLimit} 个`}`)
    successDetail.value = parts.join(' · ')
    cardCode.value = ''
    status.value = {
      exists: true,
      username: username.value.trim(),
      isExpired: false,
      isPermanent: subscription.isPermanent === true,
      expiresAtText,
      accountLimit: result.accountLimit,
    }
    emit('done', username.value.trim())
  }
  catch (error: any) {
    const payload = error?.response?.data
    if (error?.response?.status === 403)
      errorMessage.value = '管理员未开放免登录续费，请登录后在「我的账户 → 卡密续费」中操作'
    else
      errorMessage.value = payload?.error || error?.message || '网络错误，请稍后重试'
  }
  finally {
    submitting.value = false
  }
}

watch(() => props.show, (visible) => {
  if (visible)
    reset()
})

watch(() => props.defaultUsername, (value) => {
  if (!props.show || username.value)
    return
  username.value = value || ''
  if (username.value.trim())
    scheduleStatusCheck()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="renew">
      <div v-if="props.show" class="renew-overlay" role="dialog" aria-modal="true" @click.self="emit('close')">
        <section class="renew-panel">
          <header class="renew-header">
            <div>
              <h2>账号续费</h2>
              <p>输入账号与卡密即可续费，账号过期也能操作</p>
            </div>
            <button type="button" class="renew-close" aria-label="关闭续费弹窗" @click="emit('close')">
              <div class="i-carbon-close" />
            </button>
          </header>

          <form class="renew-body" @submit.prevent="submit">
            <label class="renew-field">
              <span class="renew-label">账号</span>
              <span class="renew-input">
                <span class="i-carbon-user text-base text-gray-400" />
                <input
                  v-model="username"
                  type="text"
                  autocomplete="username"
                  placeholder="请输入要续费的账号"
                  @input="scheduleStatusCheck"
                >
              </span>
            </label>

            <label class="renew-field">
              <span class="renew-label">卡密</span>
              <span class="renew-input font-mono">
                <span class="i-carbon-ticket text-base text-gray-400" />
                <input
                  v-model="cardCode"
                  type="text"
                  placeholder="例如 XXXX-XXXX-XXXX-XXXX"
                >
              </span>
            </label>

            <p v-if="statusText" class="renew-hint" :class="statusTone">
              {{ statusText }}
            </p>

            <p v-if="errorMessage" class="renew-hint text-red-500">
              <span class="i-carbon-warning-filled mr-1 align-middle" />{{ errorMessage }}
            </p>

            <div v-if="successMessage" class="renew-success">
              <div class="flex items-center gap-1.5 text-sm text-emerald-600 font-semibold">
                <div class="i-carbon-checkmark-filled" />
                {{ successMessage }}
              </div>
              <p v-if="successDetail" class="mt-1 text-xs text-gray-600">
                {{ successDetail }}
              </p>
            </div>

            <p class="renew-note">
              加时卡在未过期时顺延有效期，已过期则从当前时间重新起算；永久卡优先级最高。
            </p>

            <div class="renew-actions">
              <button type="button" class="renew-cancel" @click="emit('close')">
                关闭
              </button>
              <button type="submit" class="bg-gradient-primary renew-submit" :disabled="!canSubmit">
                <span v-if="submitting" class="i-svg-spinners-90-ring-with-bg mr-1 align-middle" />
                {{ submitting ? '核销中…' : '立即核销' }}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.renew-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(6px);
}

.renew-panel {
  width: min(440px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 26px 72px rgba(15, 23, 42, 0.24);
}

.renew-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 14px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.renew-header h2 {
  margin: 0;
  color: #1f2937;
  font-size: 1.1rem;
  font-weight: 700;
}

.renew-header p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 0.76rem;
}

.renew-close {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 10px;
  color: #64748b;
  cursor: pointer;
  background: transparent;
  transition: 0.2s ease;
}

.renew-close:hover {
  color: #1f2937;
  border-color: rgba(15, 23, 42, 0.08);
  background: #f3f4f6;
}

.renew-body {
  display: grid;
  gap: 12px;
  padding: 16px 22px 20px;
}

.renew-field {
  display: grid;
  gap: 6px;
}

.renew-label {
  color: #4b5563;
  font-size: 0.78rem;
  font-weight: 600;
}

.renew-input {
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

.renew-input:focus-within {
  border-color: rgba(34, 197, 94, 0.6);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.12);
}

.renew-input input {
  width: 100%;
  min-width: 0;
  border: none;
  background: transparent;
  color: #1f2937;
  font-size: 0.875rem;
  outline: none;
}

.renew-input input::placeholder {
  color: #9ca3af;
}

.renew-hint {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.5;
}

.renew-success {
  padding: 10px 12px;
  border: 1px solid rgba(34, 197, 94, 0.25);
  border-radius: 12px;
  background: rgba(34, 197, 94, 0.08);
}

.renew-note {
  margin: 0;
  color: #9ca3af;
  font-size: 0.7rem;
  line-height: 1.5;
}

.renew-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}

.renew-cancel {
  padding: 10px 16px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  color: #4b5563;
  font-size: 0.85rem;
  cursor: pointer;
  background: #fff;
  transition: 0.2s ease;
}

.renew-cancel:hover {
  background: #f9fafb;
}

.renew-submit {
  display: inline-flex;
  min-width: 116px;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.renew-submit:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.renew-enter-active,
.renew-leave-active {
  transition: opacity 0.2s ease;
}

.renew-enter-active .renew-panel,
.renew-leave-active .renew-panel {
  transition: transform 0.2s ease;
}

.renew-enter-from,
.renew-leave-to {
  opacity: 0;
}

.renew-enter-from .renew-panel,
.renew-leave-to .renew-panel {
  transform: translateY(10px);
}

@media (max-width: 640px) {
  .renew-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .renew-panel {
    width: 100%;
    max-height: 92vh;
    border-radius: 20px 20px 0 0;
  }
}
</style>
