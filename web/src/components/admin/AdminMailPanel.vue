<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

interface Recipient {
  username: string
  role: string
  isExpired: boolean
  expiresAtText: string
  email: string
  emailSource: 'reminder' | 'profile' | ''
}

const recipients = ref<Recipient[]>([])
const loading = ref(false)
const sending = ref(false)
const keyword = ref('')
const onlyWithEmail = ref(true)
const includeExpired = ref(false)
const selected = ref<string[]>([])

const subject = ref('')
const content = ref('')
const result = ref<{ sent: number, failed: number, skipped: { username: string, reason: string }[] } | null>(null)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return recipients.value.filter((item) => {
    if (onlyWithEmail.value && !item.email)
      return false
    if (!includeExpired.value && item.isExpired)
      return false
    if (!kw)
      return true
    return item.username.toLowerCase().includes(kw) || item.email.toLowerCase().includes(kw)
  })
})

const selectableCount = computed(() => filtered.value.length)
const allSelected = computed(() => selectableCount.value > 0 && filtered.value.every(item => selected.value.includes(item.username)))

async function loadRecipients() {
  loading.value = true
  try {
    const res = await api.get('/api/admin/mail-recipients')
    if (res.data?.ok) {
      recipients.value = Array.isArray(res.data.data) ? res.data.data : []
      // 默认：已过期用户不勾选（列表里也不显示，除非手动打开开关）
      selected.value = selected.value.filter(name => recipients.value.some(item => item.username === name))
    }
    else {
      toast.error(res.data?.error || '读取用户列表失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '读取用户列表失败')
  }
  finally {
    loading.value = false
  }
}

function toggleAll() {
  if (allSelected.value) {
    const visible = new Set(filtered.value.map(item => item.username))
    selected.value = selected.value.filter(name => !visible.has(name))
    return
  }
  const next = new Set(selected.value)
  for (const item of filtered.value) next.add(item.username)
  selected.value = [...next]
}

function toggleOne(username: string) {
  if (selected.value.includes(username))
    selected.value = selected.value.filter(name => name !== username)
  else
    selected.value = [...selected.value, username]
}

async function sendMail() {
  if (sending.value)
    return
  if (!subject.value.trim()) {
    toast.error('请填写邮件主题')
    return
  }
  if (!content.value.trim()) {
    toast.error('请填写邮件内容')
    return
  }
  if (!selected.value.length) {
    toast.error('请至少选择一个收件用户')
    return
  }
  sending.value = true
  result.value = null
  try {
    const res = await api.post('/api/admin/mail/send', {
      usernames: selected.value,
      subject: subject.value.trim(),
      content: content.value,
      includeExpired: includeExpired.value,
    })
    if (res.data?.ok) {
      result.value = res.data.data
      toast.success(res.data.message || '发送完成')
    }
    else {
      toast.error(res.data?.error || '发送失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '发送失败')
  }
  finally {
    sending.value = false
  }
}

onMounted(loadRecipients)
</script>

<template>
  <div class="space-y-4">
    <div class="ui-card rounded-xl p-4">
      <div class="mb-1 flex flex-wrap items-center gap-2">
        <div class="i-carbon-send-alt text-lg" style="color: var(--theme-primary);" />
        <h2 class="text-base text-gray-900 font-semibold dark:text-gray-100">
          发送通知邮件
        </h2>
        <span class="text-xs text-gray-400">使用「全局设置 → 全局邮件服务」里的 SMTP</span>
      </div>
      <p class="mb-3 text-xs text-gray-500 leading-relaxed dark:text-gray-400">
        收件地址优先取用户「通知设置」里填写的收件邮箱，没有则用其账号资料里的邮箱。
        默认不发送给已过期用户，需要时可在下方打开「包含已过期用户」。
      </p>

      <div class="space-y-3">
        <BaseInput v-model="subject" label="邮件主题" type="text" placeholder="例如：系统维护通知" />
        <div class="flex flex-col gap-1.5">
          <span class="text-sm text-gray-700 font-medium dark:text-gray-300">邮件内容</span>
          <textarea
            v-model="content"
            rows="6"
            class="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm outline-none dark:border-gray-700 focus:border-[var(--theme-primary)] dark:bg-gray-800"
            placeholder="支持多行文本，会原样作为邮件正文发送"
          />
        </div>
      </div>
    </div>

    <div class="ui-card rounded-xl p-4">
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <h3 class="text-sm text-gray-900 font-semibold dark:text-gray-100">
          收件人
        </h3>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          已选 <b style="color: var(--theme-primary);">{{ selected.length }}</b> / 可选 {{ selectableCount }}
        </span>
        <span v-if="loading" class="text-xs text-gray-400">读取中…</span>
        <BaseButton variant="text" size="sm" :disabled="loading" @click="loadRecipients">
          刷新列表
        </BaseButton>
      </div>

      <div class="mb-3 flex flex-wrap items-center gap-3">
        <div class="min-w-[200px] flex-1">
          <BaseInput v-model="keyword" type="text" placeholder="搜索用户名或邮箱" label="" />
        </div>
        <BaseSwitch v-model="onlyWithEmail" label="只看有邮箱的" />
        <BaseSwitch v-model="includeExpired" label="包含已过期用户" />
        <BaseButton variant="secondary" size="sm" :disabled="!selectableCount" @click="toggleAll">
          {{ allSelected ? '取消全选' : '全选当前列表' }}
        </BaseButton>
      </div>

      <div class="custom-scrollbar max-h-[420px] overflow-y-auto border border-gray-200 rounded-lg dark:border-gray-700">
        <label
          v-for="item in filtered"
          :key="item.username"
          class="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60"
        >
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--theme-primary)]"
            :checked="selected.includes(item.username)"
            @change="toggleOne(item.username)"
          >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm text-gray-900 dark:text-gray-100">{{ item.username }}</span>
              <span v-if="item.role === 'super_admin'" class="rounded bg-purple-100 px-1.5 text-[11px] text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">超管</span>
              <span v-else-if="item.role === 'admin'" class="rounded bg-blue-100 px-1.5 text-[11px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">管理员</span>
              <span v-if="item.isExpired" class="rounded bg-red-100 px-1.5 text-[11px] text-red-600 dark:bg-red-900/40 dark:text-red-300">
                已过期{{ item.expiresAtText ? ` · ${item.expiresAtText}` : '' }}
              </span>
            </div>
            <div class="text-xs" :class="item.email ? 'text-gray-500 dark:text-gray-400' : 'text-orange-500'">
              {{ item.email || '未填写邮箱（通知设置里填收件邮箱，或在账号资料里补邮箱）' }}
            </div>
          </div>
        </label>

        <div v-if="!filtered.length" class="px-3 py-6 text-center text-xs text-gray-400">
          没有匹配的用户
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 dark:border-gray-700">
        <span class="text-xs text-gray-500 dark:text-gray-400">
          发送时每封之间间隔约 0.3 秒，请勿一次选择过多用户
        </span>
        <BaseButton variant="primary" size="sm" :loading="sending" :disabled="!selected.length" @click="sendMail">
          发送给 {{ selected.length }} 位用户
        </BaseButton>
      </div>

      <div v-if="result" class="mt-3 border border-gray-200 rounded-lg bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-800/60">
        <div class="mb-1 text-gray-700 dark:text-gray-200">
          发送结果：成功 <b class="text-green-600">{{ result.sent }}</b>，
          失败 <b class="text-red-500">{{ result.failed }}</b>，
          跳过 <b>{{ result.skipped.length }}</b>
        </div>
        <ul v-if="result.skipped.length" class="max-h-40 list-disc overflow-y-auto pl-4 text-gray-500 space-y-0.5 dark:text-gray-400">
          <li v-for="item in result.skipped" :key="item.username">
            {{ item.username }} — {{ item.reason }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
