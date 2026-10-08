<script setup lang="ts">
import type { User } from '@/stores/user'
import { computed, onMounted, ref } from 'vue'
import { useToastStore } from '@/stores/toast'
import {
  formatExpiresAt,
  formatRemaining,

  useUserStore,
} from '@/stores/user'

const userStore = useUserStore()
const toast = useToastStore()

const users = ref<User[]>([])
const loading = ref(false)
const keyword = ref('')
const stats = ref<any>(null)

// 弹窗状态
type ModalKind = 'create' | 'edit' | 'renew' | 'accounts' | null
const modal = ref<ModalKind>(null)
const activeUser = ref<User | null>(null)
const submitting = ref(false)

const form = ref({
  username: '',
  password: '',
  role: 'user' as 'user' | 'admin' | 'super_admin',
  accountLimit: 2,
  expiresAt: '',
  isPermanent: false,
  nick: '',
  remark: '',
})

const renewCode = ref('')
const accountDetail = ref<any>(null)

const filteredUsers = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  if (!text)
    return users.value
  return users.value.filter(user =>
    user.username.toLowerCase().includes(text)
    || (user.nick || '').toLowerCase().includes(text)
    || (user.remark || '').toLowerCase().includes(text),
  )
})

// 编辑的是自己 → 角色不可改（后端也会拦截，避免把自己降权锁在门外）
const isEditingSelf = computed(() =>
  modal.value === 'edit'
  && !!activeUser.value
  && activeUser.value.username === userStore.username,
)

async function load() {
  loading.value = true
  try {
    users.value = await userStore.fetchUsers()
    stats.value = await userStore.fetchUserStats()
  }
  finally {
    loading.value = false
  }
}

function openCreate() {
  activeUser.value = null
  form.value = {
    username: '',
    password: '',
    role: 'user',
    accountLimit: 2,
    expiresAt: '',
    isPermanent: false,
    nick: '',
    remark: '',
  }
  modal.value = 'create'
}

function openEdit(user: User) {
  activeUser.value = user
  form.value = {
    username: user.username,
    password: '',
    role: user.role === 'super_admin' ? 'super_admin' : user.role === 'admin' ? 'admin' : 'user',
    // -1 表示不限额度，原样回填，避免编辑时被悄悄改成 99
    accountLimit: user.accountLimit ?? 2,
    expiresAt: user.subscription?.expiresAt
      ? new Date(user.subscription.expiresAt).toISOString().slice(0, 16)
      : '',
    isPermanent: user.subscription?.isPermanent === true,
    nick: user.nick || '',
    remark: user.remark || '',
  }
  modal.value = 'edit'
}

function openRenew(user: User) {
  activeUser.value = user
  renewCode.value = ''
  modal.value = 'renew'
}

async function openAccounts(user: User) {
  activeUser.value = user
  accountDetail.value = null
  modal.value = 'accounts'
  accountDetail.value = await userStore.fetchUserAccounts(user.username, true)
}

function closeModal() {
  modal.value = null
  activeUser.value = null
}

async function submitCreateOrEdit() {
  submitting.value = true
  try {
    const payload: Record<string, any> = {
      username: form.value.username,
      password: form.value.password || undefined,
      role: form.value.role,
      accountLimit: form.value.accountLimit,
      nick: form.value.nick,
      remark: form.value.remark,
      isPermanent: form.value.isPermanent,
      expiresAt: form.value.isPermanent ? null : (form.value.expiresAt || null),
    }
    const result = modal.value === 'create'
      ? await userStore.createUser(payload)
      : await userStore.editUser(activeUser.value!.username, {
          ...payload,
          newUsername: payload.username,
          password: form.value.password || undefined,
        })
    if (!result.ok) {
      toast.error(result.error || '操作失败')
      return
    }
    toast.success(modal.value === 'create' ? '用户创建成功' : '用户已更新')
    closeModal()
    await load()
  }
  finally {
    submitting.value = false
  }
}

async function submitRenew() {
  if (!renewCode.value.trim()) {
    toast.warning('请输入卡密')
    return
  }
  submitting.value = true
  try {
    const result = await userStore.renewUser(activeUser.value!.username, renewCode.value.trim())
    if (!result.ok) {
      toast.error(result.error || '核销失败')
      return
    }
    toast.success(`核销成功：${result.data?.summary || ''}`)
    closeModal()
    await load()
  }
  finally {
    submitting.value = false
  }
}

async function toggleEnabled(user: User) {
  const enabled = user.subscription?.enabled === false
  const result = await userStore.updateUserStatus(user.username, { enabled, confirmed: true })
  if (!result.ok) {
    toast.error(result.error || '操作失败')
    return
  }
  toast.success(enabled ? '账号已启用' : '账号已禁用')
  await load()
}

async function removeUser(user: User) {
  if (!window.confirm(`确认删除用户「${user.username}」？该操作不可撤销。`))
    return
  const result = await userStore.deleteUser(user.username)
  if (!result.ok) {
    toast.error(result.error || '删除失败')
    return
  }
  toast.success('用户已删除')
  await load()
}

async function clearExpired() {
  if (!window.confirm('确认清理所有已过期的普通用户？管理员不受影响。'))
    return
  const result = await userStore.clearExpiredUsers()
  if (!result.ok) {
    toast.error(result.error || '清理失败')
    return
  }
  toast.success(`已清理 ${result.data?.deletedCount || 0} 个过期用户`)
  await load()
}

function statusBadge(user: User) {
  if (user.role !== 'user')
    return { text: user.role === 'super_admin' ? '超管' : '管理员', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' }
  if (user.subscription?.enabled === false)
    return { text: '已禁用', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' }
  if (user.isExpired)
    return { text: '已过期', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
  return { text: '正常', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' }
}

onMounted(load)
defineExpose({ load })
</script>

<template>
  <div class="space-y-4">
    <!-- 统计 -->
    <div v-if="stats" class="grid grid-cols-2 gap-3 md:grid-cols-5">
      <div
        v-for="item in [
          { label: '总用户', value: stats.total, icon: 'i-carbon-user-multiple' },
          { label: '管理员', value: stats.admin, icon: 'i-carbon-user-admin' },
          { label: '正常', value: stats.active, icon: 'i-carbon-checkmark-outline' },
          { label: '已过期', value: stats.expired, icon: 'i-carbon-time' },
          { label: '已禁用', value: stats.disabled, icon: 'i-carbon-misuse' },
        ]" :key="item.label" class="ui-card rounded-xl p-3"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ item.label }}</span>
          <div :class="item.icon" class="text-sm opacity-50" />
        </div>
        <div class="mt-1 text-xl text-gray-900 font-bold dark:text-gray-100">
          {{ item.value }}
        </div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="keyword"
        placeholder="搜索用户名 / 昵称 / 备注"
        class="min-w-48 flex-1 border rounded-xl px-3 py-2 text-sm outline-none"
        style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);"
      >
      <button
        class="bg-gradient-primary flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-white font-medium hover:opacity-90"
        @click="openCreate"
      >
        <div class="i-carbon-add" />
        新建用户
      </button>
      <button
        class="flex items-center gap-1.5 border rounded-xl px-3 py-2 text-sm transition hover:bg-gray-100 dark:hover:bg-gray-700"
        style="border-color: var(--surface-border); color: var(--theme-text);"
        @click="load"
      >
        <div class="i-carbon-renew" :class="{ 'animate-spin': loading }" />
        刷新
      </button>
      <button
        class="flex items-center gap-1.5 border border-red-300 rounded-xl px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:hover:bg-red-900/20"
        @click="clearExpired"
      >
        <div class="i-carbon-trash-can" />
        清理过期
      </button>
    </div>

    <!-- 用户列表 -->
    <div class="ui-card overflow-hidden rounded-xl">
      <div class="custom-scrollbar max-h-[28rem] overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 text-xs text-gray-500 dark:text-gray-400" style="background: var(--surface-2);">
            <tr>
              <th class="px-3 py-2.5 font-medium">
                用户
              </th>
              <th class="px-3 py-2.5 font-medium">
                状态
              </th>
              <th class="px-3 py-2.5 font-medium">
                有效期
              </th>
              <th class="px-3 py-2.5 font-medium">
                额度
              </th>
              <th class="px-3 py-2.5 text-right font-medium">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredUsers.length === 0">
              <td colspan="5" class="px-3 py-8 text-center text-gray-400">
                暂无用户
              </td>
            </tr>
            <tr
              v-for="user in filteredUsers"
              :key="user.username"
              class="border-t"
              style="border-color: var(--surface-border);"
            >
              <td class="px-3 py-2.5">
                <div class="flex items-center gap-1.5">
                  <span class="text-gray-900 font-medium dark:text-gray-100">{{ user.username }}</span>
                  <span
                    v-if="user.role !== 'user'"
                    class="rounded px-1.5 py-0.5 text-[10px] text-white font-medium"
                    :class="user.role === 'super_admin' ? 'bg-purple-500' : 'bg-blue-500'"
                  >{{ user.role === 'super_admin' ? '超管' : '管理员' }}</span>
                </div>
                <div class="text-[11px] text-gray-400">
                  农场账号 {{ user.accountCount ?? 0 }} 个
                </div>
              </td>
              <td class="px-3 py-2.5">
                <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusBadge(user).cls">
                  {{ statusBadge(user).text }}
                </span>
              </td>
              <td class="px-3 py-2.5">
                <div class="text-xs" style="color: var(--theme-text);">
                  {{ formatExpiresAt(user.subscription) }}
                </div>
                <div class="text-[11px] text-gray-400">
                  {{ user.subscription?.isPermanent ? '' : formatRemaining(user.remainingMs) }}
                </div>
              </td>
              <td class="px-3 py-2.5 text-xs">
                {{ user.accountLimit < 0 ? '不限' : `${user.accountCount ?? 0} / ${user.accountLimit}` }}
              </td>
              <td class="px-3 py-2.5">
                <div class="flex items-center justify-end gap-1">
                  <button class="icon-btn" title="编辑" @click="openEdit(user)">
                    <div class="i-carbon-edit" />
                  </button>
                  <button class="icon-btn" title="核销卡密" @click="openRenew(user)">
                    <div class="i-carbon-gift" />
                  </button>
                  <button class="icon-btn" title="名下账号" @click="openAccounts(user)">
                    <div class="i-carbon-list" />
                  </button>
                  <button
                    v-if="user.role === 'user'"
                    class="icon-btn"
                    :title="user.subscription?.enabled === false ? '启用' : '禁用'"
                    @click="toggleEnabled(user)"
                  >
                    <div :class="user.subscription?.enabled === false ? 'i-carbon-play' : 'i-carbon-pause'" />
                  </button>
                  <button class="icon-btn icon-btn-danger" title="删除" @click="removeUser(user)">
                    <div class="i-carbon-trash-can" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 弹窗 -->
    <div
      v-if="modal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      @click.self="closeModal"
    >
      <div class="ui-card-elevated max-h-[85vh] max-w-lg w-full overflow-y-auto rounded-2xl p-5">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base text-gray-900 font-semibold dark:text-gray-100">
            {{ modal === 'create' ? '新建用户' : modal === 'edit' ? `编辑用户 · ${activeUser?.username}` : modal === 'renew' ? `核销卡密 · ${activeUser?.username}` : `名下农场账号 · ${activeUser?.username}` }}
          </h3>
          <button class="icon-btn" @click="closeModal">
            <div class="i-carbon-close" />
          </button>
        </div>

        <!-- 新建 / 编辑 -->
        <div v-if="modal === 'create' || modal === 'edit'" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-xs text-gray-500">用户名</label>
              <input v-model="form.username" class="form-input" placeholder="3-32 位">
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500">角色</label>
              <select v-model="form.role" class="form-input" :disabled="isEditingSelf">
                <option value="user">
                  普通用户
                </option>
                <option value="admin">
                  管理员
                </option>
                <option v-if="userStore.isSuperAdmin" value="super_admin">
                  超级管理员
                </option>
              </select>
              <p v-if="isEditingSelf" class="mt-1 text-xs text-gray-400">
                不能修改自己的角色
              </p>
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs text-gray-500">
              密码{{ modal === 'edit' ? '（留空表示不修改）' : '' }}
            </label>
            <input v-model="form.password" type="password" class="form-input" placeholder="至少 6 位，含两类字符">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-xs text-gray-500">账号额度（-1 不限）</label>
              <input v-model.number="form.accountLimit" type="number" min="-1" class="form-input">
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500">昵称</label>
              <input v-model="form.nick" class="form-input">
            </div>
          </div>
          <div class="flex items-center gap-2">
            <input id="user-permanent" v-model="form.isPermanent" type="checkbox" class="accent-primary">
            <label for="user-permanent" class="text-xs text-gray-600 dark:text-gray-300">永久有效</label>
          </div>
          <div v-if="!form.isPermanent">
            <label class="mb-1 block text-xs text-gray-500">到期时间</label>
            <input v-model="form.expiresAt" type="datetime-local" class="form-input">
          </div>
          <div>
            <label class="mb-1 block text-xs text-gray-500">备注</label>
            <input v-model="form.remark" class="form-input">
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button class="btn-ghost" @click="closeModal">
              取消
            </button>
            <button class="btn-primary-sm" :disabled="submitting" @click="submitCreateOrEdit">
              {{ submitting ? '提交中…' : '保存' }}
            </button>
          </div>
        </div>

        <!-- 核销卡密 -->
        <div v-else-if="modal === 'renew'" class="space-y-3">
          <p class="text-xs text-gray-500 dark:text-gray-400">
            输入一张卡密为「{{ activeUser?.username }}」核销。加时卡延长有效期，额度卡提升账号配额。
          </p>
          <input v-model="renewCode" class="form-input font-mono" placeholder="XXXX-XXXX-XXXX-XXXX">
          <div class="flex justify-end gap-2 pt-2">
            <button class="btn-ghost" @click="closeModal">
              取消
            </button>
            <button class="btn-primary-sm" :disabled="submitting" @click="submitRenew">
              {{ submitting ? '核销中…' : '立即核销' }}
            </button>
          </div>
        </div>

        <!-- 名下账号 -->
        <div v-else-if="modal === 'accounts'" class="space-y-3">
          <div v-if="!accountDetail" class="py-6 text-center text-sm text-gray-400">
            加载中…
          </div>
          <template v-else>
            <div class="text-xs text-gray-500">
              共 {{ accountDetail.total }} 个农场账号
            </div>
            <div
              v-for="account in accountDetail.accounts"
              :key="account.id"
              class="border rounded-xl p-3"
              style="border-color: var(--surface-border);"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-900 font-medium dark:text-gray-100">
                  {{ account.name || account.nick || `账号 ${account.id}` }}
                </span>
                <span class="text-[11px] text-gray-400">ID {{ account.id }} · {{ account.platform || '-' }}</span>
              </div>
              <div v-if="account.config" class="grid grid-cols-2 mt-2 gap-1 text-[11px] text-gray-500">
                <span>开启任务：{{ Object.values(account.config.automation || {}).filter(Boolean).length }} 项</span>
                <span>种植策略：{{ account.config.plantingStrategy || '-' }}</span>
                <span>农场间隔：{{ account.config.intervals?.farm ?? '-' }}s</span>
                <span>好友间隔：{{ account.config.intervals?.friend ?? '-' }}s</span>
              </div>
            </div>
            <div v-if="accountDetail.accounts.length === 0" class="py-4 text-center text-sm text-gray-400">
              该用户暂无农场账号
            </div>
            <div class="flex justify-end pt-2">
              <button class="btn-ghost" @click="closeModal">
                关闭
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  width: 28px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--muted-text);
  transition: all 0.15s;
}
.icon-btn:hover {
  background: var(--surface-2);
  color: var(--theme-primary);
}
.icon-btn-danger:hover {
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444;
}
.form-input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--surface-border);
  background: var(--input-bg);
  color: var(--theme-text);
  padding: 8px 12px;
  font-size: 13px;
  outline: none;
}
.form-input:focus {
  border-color: var(--theme-primary);
}
.btn-ghost {
  border-radius: 10px;
  border: 1px solid var(--surface-border);
  padding: 7px 14px;
  font-size: 13px;
  color: var(--theme-text);
}
.btn-primary-sm {
  border-radius: 10px;
  background: var(--theme-gradient);
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}
.btn-primary-sm:disabled {
  opacity: 0.5;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.35);
  border-radius: 3px;
}
</style>
