<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import AccountFeatureSettings from '@/components/settings/AccountFeatureSettings.vue'
import AccountSettingsTab from '@/components/settings/AccountSettingsTab.vue'
import AutoCodeRefreshCard from '@/components/settings/AutoCodeRefreshCard.vue'
import ChangePasswordCard from '@/components/settings/ChangePasswordCard.vue'
import OfflineReminderCard from '@/components/settings/OfflineReminderCard.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountSettings } from '@/composables/settings/useAccountSettings'
import { useAutomationSettings } from '@/composables/settings/useAutomationSettings'
import { useStrategySettings } from '@/composables/settings/useStrategySettings'
import { useUserSettings } from '@/composables/settings/useUserSettings'
import { useSettingStore } from '@/stores/setting'
import { useUserStore } from '@/stores/user'
import AdminPanel from '@/views/AdminPanel.vue'
import RenewalPanel from '@/views/Renewal.vue'

const settingStore = useSettingStore()
const userStore = useUserStore()
const route = useRoute()

const isAdminUser = computed(() => userStore.isAdmin)
/** 管理后台仅超级管理员可见 */
const isSuperAdminUser = computed(() => userStore.isSuperAdmin)
type SettingsTabKey = 'account' | 'account-config' | 'notification' | 'my-account' | 'admin-panel'

const SETTINGS_TAB_KEYS: SettingsTabKey[] = ['account', 'account-config', 'notification', 'my-account', 'admin-panel']
const LEGACY_SETTINGS_TABS: Record<string, SettingsTabKey> = {
  'strategy': 'account-config',
  'automation': 'account-config',
  'default-plan': 'account-config',
  'user': 'notification',
  // 系统配置页签已移除：定时刷新重登并入我的账号，连接参数等并入管理后台全局设置
  'system': 'my-account',
  'capture': 'my-account',
}

function getInitialSettingsTab(): SettingsTabKey {
  const requested = String(route.query.tab || '')
  if (LEGACY_SETTINGS_TABS[requested])
    return LEGACY_SETTINGS_TABS[requested]
  if (SETTINGS_TAB_KEYS.includes(requested as SettingsTabKey))
    return requested as SettingsTabKey
  const saved = localStorage.getItem('settings-active-tab')
  if (saved && LEGACY_SETTINGS_TABS[saved])
    return LEGACY_SETTINGS_TABS[saved]
  return SETTINGS_TAB_KEYS.includes(saved as SettingsTabKey)
    ? saved as SettingsTabKey
    : 'account'
}

const activeTab = ref<SettingsTabKey>(getInitialSettingsTab())
// 无权限用户从 localStorage 恢复到受限 tab 时回落到账号管理
if (activeTab.value === 'admin-panel' && !isSuperAdminUser.value)
  activeTab.value = 'account'
const settingsTabsNav = ref<HTMLElement | null>(null)

async function scrollActiveTabIntoView() {
  await nextTick()
  const button = settingsTabsNav.value?.querySelector<HTMLElement>(`[data-settings-tab="${activeTab.value}"]`)
  button?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}

watch(activeTab, (newTab) => {
  localStorage.setItem('settings-active-tab', newTab)
  void scrollActiveTabIntoView()
})

const tabs = [
  { key: 'account', label: '账号管理', icon: 'i-carbon-user-settings' },
  { key: 'account-config', label: '账号设置', icon: 'i-carbon-settings-adjust' },
  { key: 'notification', label: '通知设置', icon: 'i-carbon-notification' },
  { key: 'my-account', label: '我的账号', icon: 'i-carbon-user-avatar' },
  { key: 'admin-panel', label: '管理后台', icon: 'i-carbon-user-admin' },
] as const

/** 管理后台 tab 仅超级管理员可见（接口均为对应角色专属）；其余页签所有登录用户可见 */
const ADMIN_ONLY_TABS: SettingsTabKey[] = []
const SUPER_ONLY_TABS: SettingsTabKey[] = ['admin-panel']
const visibleTabs = computed(() =>
  tabs.filter((tab) => {
    if (SUPER_ONLY_TABS.includes(tab.key))
      return isSuperAdminUser.value
    if (ADMIN_ONLY_TABS.includes(tab.key))
      return isAdminUser.value
    return true
  }),
)

const modalVisible = ref(false)
const defaultPlanSettingId = ref('')
const defaultPlanApplyingId = ref('')
const defaultPlanConfirmation = ref<{
  action: 'set' | 'apply'
  account: any
} | null>(null)
const defaultPlanConfirmationVisible = computed(() => !!defaultPlanConfirmation.value)
const defaultPlanConfirmationTitle = computed(() =>
  defaultPlanConfirmation.value?.action === 'set' ? '设置默认方案' : '应用默认方案',
)
const defaultPlanConfirmationMessage = computed(() => {
  const pending = defaultPlanConfirmation.value
  if (!pending)
    return ''
  const accountName = pending.account?.name || pending.account?.id
  return pending.action === 'set'
    ? `确定将 ${accountName} 的当前配置设置为默认方案吗？这会覆盖此前保存的默认方案。`
    : `确定将默认方案应用到 ${accountName} 吗？这会覆盖该账号当前的相关配置。`
})
const modalConfig = ref({
  title: '',
  message: '',
  type: 'primary' as 'primary' | 'danger',
  isAlert: true,
})

function showAlert(message: string, type: 'primary' | 'danger' = 'primary') {
  modalConfig.value = {
    title: type === 'danger' ? '错误' : '提示',
    message,
    type,
    isAlert: true,
  }
  modalVisible.value = true
}

const {
  offlineSaving,
  offlineTesting,
  localOffline,
  channelOptions,
  currentChannelDocUrl,
  openChannelDocs,
  syncLocalOfflineSettings,
  handleSaveOffline,
  handleTestOffline,
} = useUserSettings(showAlert)

const {
  accounts,
  accountsLoading,
  currentAccountId,
  currentAccountName,
  userIsAdmin,
  userIsSuperAdmin,
  currentUserUsername,
  showModal,
  showDeleteConfirm,
  deleteLoading,
  editingAccount,
  accountToDelete,
  showClearStoppedConfirm,
  clearStoppedLoading,
  refreshWxCodesLoading,
  stoppedAccountsCount,
  isAddAccountDisabled,
  addAccountDisabledReason,
  isAccountOpsDisabled,
  fetchAccounts,
  selectFirstAccountIfNeeded,
  openAddModal,
  openEditModal,
  handleDelete,
  confirmDelete,
  toggleAccount,
  refreshWxCodesNow,
  handleSaved,
  selectAccount,
  openClearStoppedConfirm,
  confirmClearStopped,
} = useAccountSettings(showAlert)

// 当前选中的账号（依赖 useAccountSettings 解构出的 accounts / currentAccountId）
const currentAccount = computed(() => accounts.value.find((acc: any) => acc.id === currentAccountId.value))

/** 账号配置编辑权限：超级管理员可操作任意账号，普通用户只能操作自己添加的账号 */
const isCurrentAccountEditable = computed(() => {
  if (!currentAccount.value)
    return false
  if (userStore.isSuperAdmin)
    return true
  const owner = String(currentAccount.value.owner || currentAccount.value.username || '').trim()
  const me = String(userStore.username || '').trim()
  return !!owner && owner === me
})

const {
  localAutomationSettings,
  localAutoCodeRefresh,
  autoCodeRefreshing,
  fertilizerLandTypeOptions,
  fertilizerOptions,
  syncLocalAutomationSettings,
  runAutoCodeRefreshNow,
} = useAutomationSettings({
  currentAccountId,
  showAlert,
})

const {
  settingsLoading,
  localStrategySettings,
  plantingStrategyOptions,
  bagFallbackStrategyOptions,
  strategyPreviewLabel,
  loadStrategyData,
  resetStrategyState,
} = useStrategySettings({
  currentAccountId,
  getAutomationSettings: () => localAutomationSettings.value,
  showAlert,
})

const accountSettingsSaving = ref(false)
const autoCodeRefreshSaving = ref(false)

function buildCurrentAccountConfig() {
  return {
    ...settingStore.settings,
    ...localStrategySettings.value,
    ...localAutomationSettings.value,
    autoCodeRefresh: localAutoCodeRefresh.value,
  }
}

async function saveCurrentAccountSettings(_module?: string, quiet = false) {
  if (!currentAccountId.value || accountSettingsSaving.value)
    return
  accountSettingsSaving.value = true
  try {
    const result = await settingStore.saveSettings(String(currentAccountId.value), buildCurrentAccountConfig())
    if (!result.ok)
      throw new Error(result.error || '保存失败')
    if (!quiet)
      showAlert('账号设置已保存')
  }
  catch (error: any) {
    showAlert(error.response?.data?.error || error.message || '账号设置保存失败', 'danger')
  }
  finally {
    accountSettingsSaving.value = false
  }
}

async function saveAutoCodeRefreshSettings() {
  if (!currentAccountId.value || autoCodeRefreshSaving.value)
    return
  autoCodeRefreshSaving.value = true
  try {
    const result = await settingStore.saveAutoCodeRefresh(String(currentAccountId.value), localAutoCodeRefresh.value)
    if (!result.ok)
      throw new Error(result.error || '保存失败')
    showAlert('微信定时刷新重登设置已保存')
  }
  catch (error: any) {
    showAlert(error.response?.data?.error || error.message || '刷新设置保存失败', 'danger')
  }
  finally {
    autoCodeRefreshSaving.value = false
  }
}

function openAccountSettings(account: any) {
  selectAccount(account)
  activeTab.value = 'account-config'
}

async function applyDefaultPlan(account: any) {
  if (!account?.id || defaultPlanSettingId.value || defaultPlanApplyingId.value)
    return
  const accountId = String(account.id)
  defaultPlanApplyingId.value = accountId
  try {
    const { data } = await api.post('/api/settings/default-plan/apply', {}, {
      headers: { 'x-account-id': accountId },
    })
    if (!data?.ok)
      throw new Error(data?.error || '应用失败')
    if (String(currentAccountId.value || '') === accountId) {
      settingStore.clearSettingsState()
      resetStrategyState()
      await loadStrategyData()
      syncLocalAutomationSettings()
    }
    showAlert(`已将默认方案应用到 ${account.name || account.id}`)
  }
  catch (error: any) {
    showAlert(error.response?.data?.error || error.message || '应用默认方案失败', 'danger')
  }
  finally {
    defaultPlanApplyingId.value = ''
  }
}

async function setDefaultPlan(account: any) {
  if (!account?.id || defaultPlanSettingId.value || defaultPlanApplyingId.value)
    return
  const accountId = String(account.id)
  defaultPlanSettingId.value = accountId
  try {
    const { data } = await api.post('/api/settings/default-plan/import', {}, {
      headers: { 'x-account-id': accountId },
    })
    if (!data?.ok)
      throw new Error(data?.error || '设置失败')
    showAlert(`已将 ${account.name || account.id} 的配置设置为默认方案`)
  }
  catch (error: any) {
    showAlert(error.response?.data?.error || error.message || '设置默认方案失败', 'danger')
  }
  finally {
    defaultPlanSettingId.value = ''
  }
}

function requestDefaultPlanConfirmation(action: 'set' | 'apply', account: any) {
  if (!account?.id || defaultPlanSettingId.value || defaultPlanApplyingId.value)
    return
  defaultPlanConfirmation.value = { action, account }
}

function closeDefaultPlanConfirmation() {
  defaultPlanConfirmation.value = null
}

function confirmDefaultPlanOperation() {
  const pending = defaultPlanConfirmation.value
  if (!pending)
    return
  closeDefaultPlanConfirmation()
  if (pending.action === 'set')
    void setDefaultPlan(pending.account)
  else
    void applyDefaultPlan(pending.account)
}

watch(currentAccountId, async () => {
  settingStore.clearSettingsState()
  resetStrategyState()
  if (currentAccountId.value) {
    await loadStrategyData()
    syncLocalAutomationSettings()
    syncLocalOfflineSettings()
  }
})

onMounted(async () => {
  await fetchAccounts()
  selectFirstAccountIfNeeded()
  if (currentAccountId.value) {
    await loadStrategyData()
    syncLocalAutomationSettings()
    syncLocalOfflineSettings()
  }
  await scrollActiveTabIntoView()
})
</script>

<template>
  <div class="settings-page">
    <div class="mb-4">
      <h1 class="text-2xl text-gray-900 font-bold dark:text-gray-100">
        <span class="inline-flex items-center gap-2 border border-white/60 rounded-full bg-white/55 px-4 py-2 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/10">
          <span class="text-lg text-[var(--theme-primary)]"><span class="i-carbon-settings block" /></span>
          设置
        </span>
      </h1>
    </div>

    <div class="settings-solid border border-gray-200 rounded-lg bg-white shadow dark:border-gray-700 dark:bg-gray-800">
      <div class="border-b border-gray-200 dark:border-gray-700">
        <nav ref="settingsTabsNav" class="flex gap-1 overflow-x-auto p-2">
          <button
            v-for="tab in visibleTabs"
            :key="tab.key"
            :data-settings-tab="tab.key"
            class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all"
            :class="activeTab === tab.key
              ? 'text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'"
            :style="activeTab === tab.key ? { backgroundColor: 'var(--theme-primary)' } : {}"
            @click="activeTab = tab.key"
          >
            <div :class="tab.icon" />
            {{ tab.label }}
          </button>
        </nav>
      </div>

      <div class="p-4">
        <!-- 账号管理 -->
        <AccountSettingsTab
          v-if="activeTab === 'account'"
          :accounts="accounts"
          :accounts-loading="accountsLoading"
          :current-account-id="currentAccountId"
          :user-is-admin="userIsAdmin"
          :user-is-super-admin="userIsSuperAdmin"
          :current-user-username="currentUserUsername"
          :stopped-accounts-count="stoppedAccountsCount"
          :is-add-account-disabled="isAddAccountDisabled"
          :add-account-disabled-reason="addAccountDisabledReason"
          :is-account-ops-disabled="isAccountOpsDisabled"
          :show-modal="showModal"
          :editing-account="editingAccount"
          :show-delete-confirm="showDeleteConfirm"
          :delete-loading="deleteLoading"
          :account-to-delete="accountToDelete"
          :show-clear-stopped-confirm="showClearStoppedConfirm"
          :clear-stopped-loading="clearStoppedLoading"
          :refresh-wx-codes-loading="refreshWxCodesLoading"
          :default-plan-setting-id="defaultPlanSettingId"
          :default-plan-applying-id="defaultPlanApplyingId"
          @add="openAddModal"
          @clear-stopped="openClearStoppedConfirm"
          @refresh-wx-codes="refreshWxCodesNow"
          @select="selectAccount"
          @toggle="toggleAccount"
          @settings="openAccountSettings"
          @set-default-plan="requestDefaultPlanConfirmation('set', $event)"
          @apply-default-plan="requestDefaultPlanConfirmation('apply', $event)"
          @edit="openEditModal"
          @delete="handleDelete"
          @saved="handleSaved"
          @close-modal="showModal = false"
          @close-delete-confirm="showDeleteConfirm = false"
          @confirm-delete="confirmDelete"
          @close-clear-stopped-confirm="showClearStoppedConfirm = false"
          @confirm-clear-stopped="confirmClearStopped"
        />

        <AccountFeatureSettings
          v-else-if="activeTab === 'account-config'"
          v-model:strategy="localStrategySettings"
          v-model:automation="localAutomationSettings"
          :current-account-name="currentAccountName"
          :current-account-id="currentAccountId"
          :loading="settingsLoading"
          :saving="accountSettingsSaving"
          :is-readonly="!isCurrentAccountEditable"
          :planting-strategy-options="plantingStrategyOptions"
          :bag-fallback-strategy-options="bagFallbackStrategyOptions"
          :strategy-preview-label="strategyPreviewLabel"
          :fertilizer-land-type-options="fertilizerLandTypeOptions"
          :fertilizer-options="fertilizerOptions"
          @save="saveCurrentAccountSettings"
        />

        <div v-else-if="activeTab === 'notification'" class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
                通知设置
              </h3>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                配置账号离线后的通知渠道和消息内容。
              </p>
            </div>
            <BaseButton size="sm" :loading="offlineSaving" :disabled="offlineTesting" @click="handleSaveOffline">
              保存通知设置
            </BaseButton>
          </div>
          <OfflineReminderCard
            v-model:config="localOffline"
            :channel-options="channelOptions"
            :current-channel-doc-url="currentChannelDocUrl"
            :saving="offlineSaving"
            :testing="offlineTesting"
            :show-save="false"
            @open-docs="openChannelDocs"
            @test="handleTestOffline"
          />
        </div>

        <!-- 我的账号：有效期 / 卡密续费 / 农场账号 / 核销记录（复用 Renewal 页面）+ 定时刷新重登 + 修改密码 -->
        <div v-else-if="activeTab === 'my-account'" class="space-y-4">
          <RenewalPanel />
          <AutoCodeRefreshCard
            v-model:config="localAutoCodeRefresh"
            :current-account-name="currentAccountName"
            :current-account-id="currentAccountId"
            :loading="settingsLoading"
            :saving="autoCodeRefreshSaving"
            :refreshing="autoCodeRefreshing"
            @save="saveAutoCodeRefreshSettings"
            @refresh="runAutoCodeRefreshNow"
          />
          <ChangePasswordCard />
        </div>

        <!-- 管理后台：用户 / 卡密 / 流水 / 日志（复用 AdminPanel 页面，仅超级管理员可见该 tab） -->
        <AdminPanel v-else-if="activeTab === 'admin-panel' && isSuperAdminUser" />
      </div>
    </div>

    <ConfirmModal
      :show="defaultPlanConfirmationVisible"
      :title="defaultPlanConfirmationTitle"
      :message="defaultPlanConfirmationMessage"
      type="danger"
      confirm-text="确认执行"
      @confirm="confirmDefaultPlanOperation"
      @close="closeDefaultPlanConfirmation"
      @cancel="closeDefaultPlanConfirmation"
    />

    <ConfirmModal
      :show="modalVisible"
      :title="modalConfig.title"
      :message="modalConfig.message"
      :type="modalConfig.type"
      :is-alert="modalConfig.isAlert"
      confirm-text="知道了"
      @confirm="modalVisible = false"
      @close="modalVisible = false"
      @cancel="modalVisible = false"
    />
  </div>
</template>

<style scoped>
/* 设置页磨砂玻璃：统一为半透明白色（不再叠加蓝→绿渐变色调，避免同页卡片颜色不统一）。
   子组件里的白底块统一降为半透明毛玻璃。 */
.settings-solid.bg-white {
  background: rgba(255, 255, 255, 0.66) !important;
  border-color: rgba(255, 255, 255, 0.65) !important;
  backdrop-filter: blur(24px) saturate(1.2) !important;
  -webkit-backdrop-filter: blur(24px) saturate(1.2) !important;
}

.settings-solid :deep(.bg-white) {
  background: rgba(255, 255, 255, 0.62) !important;
  backdrop-filter: blur(20px) saturate(1.2) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.2) !important;
  border-color: rgba(255, 255, 255, 0.6) !important;
}
</style>
