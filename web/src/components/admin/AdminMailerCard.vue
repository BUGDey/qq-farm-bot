<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

interface MailerConfig {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  hasSmtpPass: boolean
  senderName: string
  subject: string
  content: string
  ready: boolean
}

const config = ref<MailerConfig>({
  enabled: false,
  smtpHost: '',
  smtpPort: 465,
  smtpUser: '',
  smtpPass: '',
  hasSmtpPass: false,
  senderName: '',
  subject: '',
  content: '',
  ready: false,
})

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const testEmail = ref('')

const passPlaceholder = computed(() => (config.value.hasSmtpPass ? '已设置，留空表示不修改' : 'SMTP 授权码'))

async function loadConfig() {
  loading.value = true
  try {
    const res = await api.get('/api/admin/mailer')
    if (res.data?.ok)
      config.value = { ...config.value, ...(res.data.data || {}), smtpPass: '' }
    else
      toast.error(res.data?.error || '读取全局邮件设置失败')
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '读取全局邮件设置失败')
  }
  finally {
    loading.value = false
  }
}

async function saveConfig() {
  if (saving.value)
    return
  saving.value = true
  try {
    const res = await api.post('/api/admin/mailer', {
      enabled: config.value.enabled,
      smtpHost: config.value.smtpHost,
      smtpPort: config.value.smtpPort,
      smtpUser: config.value.smtpUser,
      senderName: config.value.senderName,
      subject: config.value.subject,
      content: config.value.content,
      // 空字符串表示不修改授权码
      smtpPass: config.value.smtpPass,
    })
    if (res.data?.ok) {
      config.value = { ...config.value, ...(res.data.data || {}), smtpPass: '' }
      toast.success(config.value.ready ? '已保存，邮件服务可用' : '已保存')
    }
    else {
      toast.error(res.data?.error || '保存失败')
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '保存失败')
  }
  finally {
    saving.value = false
  }
}

async function sendTest() {
  if (testing.value)
    return
  if (!testEmail.value.trim()) {
    toast.error('请先填写测试收件邮箱')
    return
  }
  testing.value = true
  try {
    const res = await api.post('/api/admin/mailer/test', { recipientEmail: testEmail.value.trim() })
    if (res.data?.ok)
      toast.success('测试邮件已发送，请到收件箱查看')
    else
      toast.error(res.data?.error || '测试邮件发送失败')
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || '测试邮件发送失败')
  }
  finally {
    testing.value = false
  }
}

onMounted(loadConfig)
</script>

<template>
  <div class="ui-card overflow-hidden rounded-xl p-4">
    <div class="mb-1 flex flex-wrap items-center gap-2">
      <div class="i-carbon-mail-all text-lg" style="color: var(--theme-primary);" />
      <h2 class="text-base text-gray-900 font-semibold dark:text-gray-100">
        全局邮件服务
      </h2>
      <span
        class="rounded-full px-2 py-0.5 text-xs"
        :class="config.ready
          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'"
      >
        {{ config.ready ? '可用' : '未启用' }}
      </span>
      <span v-if="loading" class="text-xs text-gray-400">读取中…</span>
    </div>
    <p class="mb-3 text-xs text-gray-500 leading-relaxed dark:text-gray-400">
      配置一次，普通用户就能在「通知设置」里勾选「使用管理员配置的邮件服务」，只填收件邮箱即可收到掉线提醒；
      你也可以用它给指定用户批量发通知。授权码只保存在服务端，前端只显示「已设置」。
    </p>

    <div class="space-y-3">
      <BaseSwitch v-model="config.enabled" label="启用全局邮件服务" />

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BaseInput v-model="config.smtpHost" label="SMTP 服务器地址" type="text" placeholder="如 smtp.qq.com" />
        <BaseInput v-model.number="config.smtpPort" label="SMTP 端口" type="number" min="1" max="65535" placeholder="465" />
      </div>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BaseInput v-model="config.smtpUser" label="邮箱账号" type="text" placeholder="发件人邮箱地址" />
        <BaseInput v-model="config.smtpPass" label="授权码" type="password" :placeholder="passPlaceholder" />
      </div>

      <BaseInput v-model="config.senderName" label="发件人名称" type="text" placeholder="发件人显示名称（可留空）" />

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BaseInput v-model="config.subject" label="默认邮件主题" type="text" placeholder="QQ 农场智能助手通知" />
        <BaseInput v-model="config.content" label="默认邮件内容" type="text" placeholder="留空则每封邮件单独填写" />
      </div>

      <div class="flex flex-wrap items-end gap-2 border-t pt-3 dark:border-gray-700">
        <div class="min-w-[220px] flex-1">
          <BaseInput v-model="testEmail" label="测试收件邮箱" type="text" placeholder="填自己的邮箱验证配置" />
        </div>
        <BaseButton variant="secondary" size="sm" :loading="testing" :disabled="saving || !config.ready" @click="sendTest">
          发送测试邮件
        </BaseButton>
        <BaseButton variant="primary" size="sm" :loading="saving" :disabled="testing" @click="saveConfig">
          保存邮件设置
        </BaseButton>
      </div>
    </div>
  </div>
</template>
