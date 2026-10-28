<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const content = ref('')
const showOnce = ref(true)
const updatedAt = ref(0)
const loading = ref(false)
const saving = ref(false)

const updatedAtText = computed(() => {
  if (!updatedAt.value)
    return '尚未发布过公告'
  const date = new Date(updatedAt.value * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `最近更新：${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
})

async function load() {
  loading.value = true
  try {
    const res = await api.get('/api/admin/announcement')
    if (res.data?.ok) {
      content.value = res.data.data?.content || ''
      showOnce.value = res.data.data?.showOnce !== false
      updatedAt.value = Number(res.data.data?.updatedAt) || 0
    }
    else {
      toast.error(res.data?.error || '读取公告失败')
    }
  }
  catch {
    toast.error('读取公告失败')
  }
  finally {
    loading.value = false
  }
}

async function save() {
  if (saving.value)
    return
  saving.value = true
  try {
    const res = await api.post('/api/admin/announcement', {
      content: content.value,
      showOnce: showOnce.value,
    })
    if (res.data?.ok) {
      updatedAt.value = Number(res.data.data?.updatedAt) || Math.floor(Date.now() / 1000)
      toast.success(content.value.trim() ? '公告已保存，用户登录后会看到' : '公告已清空')
    }
    else {
      toast.error(res.data?.error || '保存公告失败')
    }
  }
  catch {
    toast.error('保存公告失败')
  }
  finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="ui-card p-5">
    <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="flex items-center gap-2 text-base text-gray-900 font-semibold">
          <div class="i-carbon-notification text-lg text-emerald-500" />
          系统公告
        </h3>
        <p class="mt-1 text-xs text-gray-500">
          公告会以弹窗形式在用户登录后展示，清空内容即关闭公告。{{ updatedAtText }}
        </p>
      </div>
      <BaseButton :loading="saving" @click="save">
        保存公告
      </BaseButton>
    </header>

    <div v-if="loading" class="py-8 text-center text-sm text-gray-400">
      正在加载公告…
    </div>

    <template v-else>
      <textarea
        v-model="content"
        rows="8"
        maxlength="4000"
        placeholder="在这里填写公告内容，支持换行。例如：本次更新新增插件系统与公告板块，详情见登录页「更新日志」。"
        class="focus:border-primary w-full resize-y border rounded-xl px-3 py-2.5 text-sm leading-relaxed outline-none transition"
        style="border-color: var(--surface-border); background: var(--input-bg); color: var(--theme-text);"
      />

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <BaseSwitch v-model="showOnce" label="每个账号确认一次后不再提示" />
        <span class="text-xs text-gray-400">{{ content.length }} / 4000</span>
      </div>
    </template>
  </section>
</template>
