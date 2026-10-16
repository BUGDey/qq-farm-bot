<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useToastStore } from '@/stores/toast'

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<Emits>()

const toastStore = useToastStore()

interface YYBConfig {
  url: string
  token: string
  enabled?: boolean
}

interface Props {
  config: YYBConfig
  loading?: boolean
}

interface Emits {
  (e: 'update:config', value: YYBConfig): void
}

const localConfig = ref<YYBConfig>({
  url: props.config.url || '',
  token: props.config.token || '',
  enabled: props.config.enabled === true,
})

const saving = ref(false)

// 监听外部config变化
watch(() => props.config, (newConfig) => {
  localConfig.value = {
    url: newConfig.url || '',
    token: newConfig.token || '',
    enabled: newConfig.enabled === true,
  }
}, { deep: true })

async function handleSave() {
  // 只有开启时才强制要求填写地址和令牌；关闭状态下允许直接保存开关
  if (localConfig.value.enabled && (!localConfig.value.url || !localConfig.value.token)) {
    toastStore.error('请填写完整的YYB配置信息')
    return
  }

  saving.value = true
  try {
    // 导入api模块
    const api = await import('@/api')
    const { data } = await api.default.post('/api/user/yyb-config', {
      url: localConfig.value.url.trim(),
      token: localConfig.value.token.trim(),
      enabled: localConfig.value.enabled === true,
    })

    if (data?.ok) {
      emit('update:config', { ...localConfig.value })
      toastStore.success('YY-GO配置保存成功')
    }
    else {
      toastStore.error(data?.error || 'YY-GO配置保存失败')
    }
  }
  catch (error: any) {
    const message = error?.response?.data?.error || error?.message || 'YY-GO配置保存失败'
    toastStore.error(message)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="border border-gray-200 rounded-xl bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
          YY-GO 配置
        </h3>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          配置 YYB 服务的地址和访问令牌。
        </p>
      </div>
    </div>

    <div class="space-y-4">
      <!-- 启用开关：关闭时添加账号弹窗不显示 YYB 获取 tab -->
      <div class="flex items-center justify-between rounded-lg px-3 py-2.5" style="background: var(--surface-2);">
        <div>
          <div class="text-sm text-gray-900 font-medium dark:text-gray-100">
            启用 YYB 获取
          </div>
          <div class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            开启后，「添加账号」弹窗才会显示 YYB 获取入口；默认关闭
          </div>
        </div>
        <BaseSwitch v-model="localConfig.enabled" :disabled="loading || saving" />
      </div>

      <!-- 服务地址 -->
      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          服务地址
        </label>
        <input
          v-model="localConfig.url"
          type="text"
          placeholder="https://your-yyb-server/wxapp/getCode"
          class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm text-gray-900 transition-colors dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none dark:placeholder:text-gray-500"
          :disabled="loading || saving"
        >
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          YYB 服务的完整 API 地址
        </p>
      </div>

      <!-- 访问令牌 -->
      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          访问令牌 (Token)
        </label>
        <input
          v-model="localConfig.token"
          type="password"
          placeholder="请输入访问令牌"
          class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm text-gray-900 transition-colors dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none dark:placeholder:text-gray-500"
          :disabled="loading || saving"
        >
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          用于认证的 Bearer Token
        </p>
      </div>

      <!-- 保存按钮 -->
      <BaseButton
        variant="primary"
        :loading="saving"
        :disabled="loading"
        @click="handleSave"
      >
        <div class="i-carbon-checkmark mr-1" />
        保存
      </BaseButton>
    </div>
  </div>
</template>
