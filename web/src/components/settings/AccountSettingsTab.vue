<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AccountModal from '@/components/AccountModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { getPlatformClass, getPlatformLabel } from '@/stores/account'

const props = defineProps<{
  accounts: any[]
  accountsLoading: boolean
  currentAccountId: string | number | null | undefined
  userIsAdmin: boolean
  userIsSuperAdmin: boolean
  currentUserUsername: string
  stoppedAccountsCount: number
  isAddAccountDisabled: boolean
  addAccountDisabledReason: string
  isAccountOpsDisabled: boolean
  showModal: boolean
  editingAccount: any
  showDeleteConfirm: boolean
  deleteLoading: boolean
  accountToDelete: any
  showClearStoppedConfirm: boolean
  clearStoppedLoading: boolean
  refreshWxCodesLoading: boolean
  defaultPlanSettingId: string
  defaultPlanApplyingId: string
}>()

const emit = defineEmits<{
  add: []
  clearStopped: []
  refreshWxCodes: []
  select: [account: any]
  toggle: [account: any]
  settings: [account: any]
  setDefaultPlan: [account: any]
  applyDefaultPlan: [account: any]
  edit: [account: any]
  delete: [account: any]
  saved: []
  closeModal: []
  closeDeleteConfirm: []
  confirmDelete: []
  closeClearStoppedConfirm: []
  confirmClearStopped: []
}>()

/** 账号是否归属当前登录用户（仅超级管理员视为全部归属，普通管理员不豁免）。其他人对非本人账号只能查看，不能操作。 */
function isOwnedAccount(acc: any) {
  if (props.userIsSuperAdmin)
    return true
  const owner = String(acc?.owner || acc?.username || '').trim()
  return !!owner && owner === String(props.currentUserUsername || '').trim()
}

// ==================== 访问凭证有效期倒计时 ====================
// credentialExpireAt 是后端按账号首次加入时间估算的绝对到期时间，本地只需
// 每秒刷新一次时钟做递减，不轮询接口也不会累积漂移；凭证刷新不会重置倒计时。
const nowTick = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  nowTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
})

function credentialRemainingMs(acc: any) {
  return Number(acc?.credentialExpireAt || 0) - nowTick.value
}

/** 中文格式：剩余 1 小时 49 分 59 秒（跳过为 0 的高位单位） */
function formatCredentialRemaining(acc: any) {
  const ms = credentialRemainingMs(acc)
  if (ms <= 0) {
    if (acc?.online)
      return '已超过预计凭证时长，账号当前在线'
    return '已过期，请重新扫码或刷新凭证'
  }
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const parts: string[] = []
  if (days)
    parts.push(`${days} 天`)
  if (days || hours)
    parts.push(`${hours} 小时`)
  if (days || hours || minutes)
    parts.push(`${minutes} 分`)
  parts.push(`${seconds} 秒`)
  return `剩余 ${parts.join(' ')}`
}

function credentialCountdownClass(acc: any) {
  const ms = credentialRemainingMs(acc)
  if (ms <= 0 && acc?.online)
    return 'text-gray-700 dark:text-gray-200'
  if (ms <= 30 * 60 * 1000)
    return 'text-red-500'
  return 'text-gray-700 dark:text-gray-200'
}

/** 创建者展示文案 */
function ownerLabel(acc: any) {
  return String(acc?.owner || acc?.username || '').trim() || '未绑定'
}

function accountAvatar(acc: any) {
  const direct = String(acc?.avatar || acc?.avatarUrl || acc?.avatar_url || '').trim()
  if (direct)
    return direct
  const qq = String(acc?.uin || acc?.qq || '').trim()
  if (/^\d+$/.test(qq))
    return `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=100`
  return ''
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
        账号管理
      </h3>
      <div class="flex flex-wrap gap-2">
        <BaseButton
          variant="outline"
          size="sm"
          :loading="refreshWxCodesLoading"
          :disabled="accountsLoading || accounts.length === 0"
          @click="emit('refreshWxCodes')"
        >
          <div class="i-carbon-renew mr-2" />
          <span class="hidden sm:inline">{{ userIsSuperAdmin ? '刷新全部微信Code' : '刷新我的微信Code' }}</span>
          <span class="sm:hidden">刷新Code</span>
        </BaseButton>
        <BaseButton
          v-if="userIsAdmin"
          variant="secondary"
          size="sm"
          :disabled="stoppedAccountsCount === 0"
          @click="emit('clearStopped')"
        >
          <div class="i-carbon-trash-can mr-2" />
          <span class="hidden sm:inline">一键清理</span>
          <span class="sm:hidden">清理</span>
          ({{ stoppedAccountsCount }})
        </BaseButton>
        <BaseButton
          variant="primary"
          size="sm"
          :disabled="isAddAccountDisabled"
          :title="addAccountDisabledReason"
          @click="emit('add')"
        >
          <div class="i-carbon-add mr-2" />
          添加账号
        </BaseButton>
      </div>
    </div>

    <div v-if="accountsLoading && accounts.length === 0" class="py-8 text-center text-gray-500">
      <div i-svg-spinners-90-ring-with-bg class="mb-2 inline-block text-2xl" />
      <div>加载中...</div>
    </div>

    <div v-else-if="accounts.length === 0" class="rounded-lg bg-white py-12 text-center shadow dark:bg-gray-800">
      <div i-carbon-user-avatar class="mb-4 inline-block text-4xl text-gray-400" />
      <p class="mb-4 text-gray-500">
        暂无账号
      </p>
      <BaseButton
        variant="text"
        size="sm"
        :disabled="isAddAccountDisabled"
        :title="addAccountDisabledReason"
        @click="emit('add')"
      >
        立即添加
      </BaseButton>
    </div>

    <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-3 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="acc in accounts"
        :key="acc.id"
        class="account-card cursor-pointer border rounded-lg bg-white p-4 shadow transition-all duration-200 dark:bg-gray-800"
        :class="String(currentAccountId) === String(acc.id) ? 'account-card-current' : 'border-transparent'"
        @click="emit('select', acc)"
      >
        <div class="flex items-center justify-between gap-3 sm:items-start sm:gap-4">
          <div class="min-w-0 flex flex-1 items-center gap-3">
            <div class="h-12 w-12 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 lt-sm:h-14 lt-sm:w-14 dark:bg-gray-700">
              <img v-if="accountAvatar(acc)" :src="accountAvatar(acc)" class="h-full w-full object-cover">
              <div v-else class="i-carbon-user text-2xl text-gray-400" />
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="flex items-center gap-1.5 truncate text-lg font-bold lt-sm:text-xl">
                <span class="truncate">{{ acc.name || acc.nick || acc.id }}</span>
                <span
                  v-if="String(currentAccountId) === String(acc.id)"
                  class="current-badge shrink-0"
                >
                  <div class="i-carbon-checkmark text-[11px]" />
                  当前账号
                </span>
              </h4>
              <div class="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  v-if="acc.platform"
                  class="rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight sm:text-[10px]"
                  :class="getPlatformClass(acc.platform)"
                >
                  {{ getPlatformLabel(acc.platform) }}
                </span>
                <span
                  class="max-w-full truncate rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500 leading-tight dark:bg-gray-700 sm:text-[10px] dark:text-gray-400"
                  :title="`创建者：${ownerLabel(acc)}`"
                >
                  创建者：{{ ownerLabel(acc) }}
                </span>
              </div>
            </div>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1.5 sm:gap-2">
            <span class="flex items-center gap-1 text-sm text-gray-500 sm:text-xs">
              <div class="h-2 w-2 rounded-full" :class="acc.running ? 'bg-green-500' : 'bg-gray-300'" />
              {{ acc.running ? '运行中' : '已停止' }}
            </span>
            <BaseButton
              variant="secondary"
              size="sm"
              class="border rounded-full px-4 shadow-sm transition-all duration-500 ease-in-out sm:w-20 active:scale-95 sm:px-2"
              :class="acc.running ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 focus:ring-red-500 active:border-red-300 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 dark:focus:ring-red-500 dark:active:border-red-700' : 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100 focus:ring-green-500 active:border-green-300 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 dark:focus:ring-green-500 dark:active:border-green-700'"
              :disabled="!isOwnedAccount(acc) || (!acc.running && isAccountOpsDisabled)"
              :title="!isOwnedAccount(acc) ? '仅账号归属用户或超级管理员可以操作' : (!acc.running && isAccountOpsDisabled ? '账号已到期，无法启动账号' : '')"
              @click="emit('toggle', acc)"
            >
              <div :class="acc.running ? 'i-carbon-stop-filled' : 'i-carbon-play-filled'" class="mr-1" />
              {{ acc.running ? '停止' : '启动' }}
            </BaseButton>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-700">
          <div class="hidden shrink-0 items-center gap-2 whitespace-nowrap text-sm text-gray-500 sm:flex">
            <span class="flex items-center gap-1">
              <div class="h-2 w-2 rounded-full" :class="acc.running ? 'bg-green-500' : 'bg-gray-300'" />
              {{ acc.running ? '运行中' : '已停止' }}
            </span>
          </div>

          <div class="flex flex-1 flex-wrap items-center justify-between gap-1.5 sm:flex-initial sm:justify-end sm:gap-2">
            <BaseButton
              :data-testid="`set-default-plan-${acc.id}`"
              variant="ghost"
              class="group relative min-h-[36px] min-w-[36px] flex-1 lt-sm:min-h-[46px] lt-sm:min-w-[46px] sm:flex-initial lt-sm:!p-3"
              :loading="defaultPlanSettingId === String(acc.id)"
              :disabled="!isOwnedAccount(acc) || !!defaultPlanSettingId || !!defaultPlanApplyingId"
              aria-label="设置默认方案"
              :title="isOwnedAccount(acc) ? '设置默认方案' : '仅账号归属用户或超级管理员可以设置'"
              @click="emit('setDefaultPlan', acc)"
            >
              <div v-if="defaultPlanSettingId !== String(acc.id)" i-carbon-document-export />
              <span class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 -translate-x-1/2 dark:bg-gray-100 dark:text-gray-900 group-focus-visible:opacity-100 group-hover:opacity-100">
                设置默认方案
              </span>
            </BaseButton>
            <BaseButton
              :data-testid="`apply-default-plan-${acc.id}`"
              variant="ghost"
              class="group relative min-h-[36px] min-w-[36px] flex-1 lt-sm:min-h-[46px] lt-sm:min-w-[46px] sm:flex-initial lt-sm:!p-3"
              :loading="defaultPlanApplyingId === String(acc.id)"
              :disabled="!isOwnedAccount(acc) || !!defaultPlanSettingId || !!defaultPlanApplyingId"
              aria-label="应用默认方案"
              :title="isOwnedAccount(acc) ? '应用默认方案' : '仅账号归属用户或超级管理员可以应用'"
              @click="emit('applyDefaultPlan', acc)"
            >
              <div v-if="defaultPlanApplyingId !== String(acc.id)" i-carbon-document-import />
              <span class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 -translate-x-1/2 dark:bg-gray-100 dark:text-gray-900 group-focus-visible:opacity-100 group-hover:opacity-100">
                应用默认方案
              </span>
            </BaseButton>
            <BaseButton
              variant="ghost"
              class="group relative min-h-[36px] min-w-[36px] flex-1 lt-sm:min-h-[46px] lt-sm:min-w-[46px] sm:flex-initial lt-sm:!p-3"
              :disabled="!isOwnedAccount(acc)"
              aria-label="设置"
              :title="isOwnedAccount(acc) ? '设置' : '仅账号归属用户或超级管理员可以配置'"
              @click="emit('settings', acc)"
            >
              <div i-carbon-settings />
              <span class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 -translate-x-1/2 dark:bg-gray-100 dark:text-gray-900 group-focus-visible:opacity-100 group-hover:opacity-100">
                设置
              </span>
            </BaseButton>
            <BaseButton
              variant="ghost"
              class="group relative min-h-[36px] min-w-[36px] flex-1 lt-sm:min-h-[46px] lt-sm:min-w-[46px] sm:flex-initial lt-sm:!p-3"
              :disabled="!isOwnedAccount(acc)"
              aria-label="编辑"
              :title="isOwnedAccount(acc) ? '编辑' : '仅账号归属用户或超级管理员可以编辑'"
              @click="emit('edit', acc)"
            >
              <div i-carbon-edit />
              <span class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 -translate-x-1/2 dark:bg-gray-100 dark:text-gray-900 group-focus-visible:opacity-100 group-hover:opacity-100">
                编辑
              </span>
            </BaseButton>
            <BaseButton
              variant="ghost"
              class="group relative min-h-[36px] min-w-[36px] flex-1 text-red-500 lt-sm:min-h-[46px] lt-sm:min-w-[46px] sm:flex-initial dark:text-red-400 disabled:text-red-300 hover:text-red-600 disabled:opacity-60 lt-sm:!p-3 dark:disabled:text-red-400/60 dark:hover:text-red-300"
              :disabled="!isOwnedAccount(acc)"
              aria-label="删除"
              :title="isOwnedAccount(acc) ? '删除' : '仅账号归属用户或超级管理员可以删除'"
              @click="emit('delete', acc)"
            >
              <div i-carbon-trash-can />
              <span class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 -translate-x-1/2 dark:bg-gray-100 dark:text-gray-900 group-focus-visible:opacity-100 group-hover:opacity-100">
                删除
              </span>
            </BaseButton>
          </div>
        </div>

        <!-- 访问凭证有效期倒计时：账号登录后显示；到期时刻为后端绝对时间戳，按系统配置的时长估算 -->
        <div
          v-if="acc.running && acc.credentialExpireAt"
          class="mt-3 flex items-center gap-1.5 border-t border-gray-100 pt-3 text-xs dark:border-gray-700"
          :title="`以账号首次加入时间 + ${acc.credentialValidityHours ?? 2} 小时估算（可在管理后台全局设置调整）；凭证刷新不会重置`"
        >
          <div class="i-carbon-timer text-sm" :class="credentialCountdownClass(acc)" />
          <span class="text-gray-500 dark:text-gray-400">访问凭证:</span>
          <span class="tabular-nums" :class="credentialCountdownClass(acc)">
            {{ formatCredentialRemaining(acc) }}
          </span>
        </div>
      </div>
    </div>

    <AccountModal
      :show="showModal"
      :edit-data="editingAccount"
      @close="emit('closeModal')"
      @saved="emit('saved')"
    />

    <ConfirmModal
      :show="showDeleteConfirm"
      :loading="deleteLoading"
      title="删除账号"
      :message="accountToDelete ? `确定要删除账号 ${accountToDelete.name || accountToDelete.id} 吗?` : ''"
      confirm-text="删除"
      type="danger"
      @close="!deleteLoading && emit('closeDeleteConfirm')"
      @cancel="!deleteLoading && emit('closeDeleteConfirm')"
      @confirm="emit('confirmDelete')"
    />

    <ConfirmModal
      :show="showClearStoppedConfirm"
      :loading="clearStoppedLoading"
      title="一键清理已停止账号"
      :message="`确定要清理 ${stoppedAccountsCount} 个已停止的账号吗？此操作不可恢复！`"
      confirm-text="确认清理"
      type="danger"
      @close="!clearStoppedLoading && emit('closeClearStoppedConfirm')"
      @cancel="!clearStoppedLoading && emit('closeClearStoppedConfirm')"
      @confirm="emit('confirmClearStopped')"
    />
  </div>
</template>

<style scoped>
/* 当前账号卡片：主题色描边框起，视觉上明确圈出（背景交给 settings-solid 统一磨砂） */
.account-card-current {
  border-color: var(--theme-primary) !important;
  box-shadow:
    0 0 0 2px var(--theme-primary),
    0 4px 14px rgba(0, 0, 0, 0.08);
}

/* 「当前账号」徽章 */
.current-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--theme-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
}
</style>
