<script setup lang="ts">
import { onMounted, ref } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'

const visible = ref(false)
const content = ref('')

onMounted(async () => {
  try {
    const { data } = await api.get('/api/announcement')
    if (data.ok && data.data?.content && data.data?.shouldShow) {
      content.value = data.data.content
      visible.value = true
    }
  }
  catch {
    // 公告接口异常不影响主流程
  }
})

async function close() {
  visible.value = false
  try {
    await api.post('/api/announcement/read')
  }
  catch {
    // 已读标记失败不影响关闭
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-9999 flex items-center justify-center bg-black/40 backdrop-blur-sm" @click.self="close">
      <div class="mx-4 max-w-md w-full rounded-2xl bg-white p-6 shadow-2xl">
        <div class="mb-4 flex items-center gap-3">
          <div class="h-10 w-10 flex items-center justify-center rounded-full" style="background: var(--theme-gradient);">
            <div class="i-carbon-notification text-xl text-white" />
          </div>
          <h3 class="text-lg text-gray-900 font-bold">
            系统公告
          </h3>
        </div>
        <div class="custom-scrollbar mb-6 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {{ content }}
        </div>
        <div class="flex justify-end">
          <BaseButton size="sm" @click="close">
            我知道了
          </BaseButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
