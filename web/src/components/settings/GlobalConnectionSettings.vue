<script setup lang="ts">
import { onMounted } from 'vue'
import AdminSystemPanel from '@/components/admin/AdminSystemPanel.vue'
import DeviceProtocolCard from '@/components/settings/DeviceProtocolCard.vue'
import YYBConfigCard from '@/components/settings/YYBConfigCard.vue'
import { useAdminSystemConfig } from '@/composables/useAdminSystemConfig'
import { useUserSettings } from '@/composables/settings/useUserSettings'
import { useToastStore } from '@/stores/toast'

// 从设置页「系统配置」tab 迁入管理后台「全局设置」：
// YY-GO 配置 / 系统配置（连接参数）/ 设备协议配置 / Code/GID 抓取服务。
// 每张卡自带保存按钮，各自调用对应接口，行为与迁移前一致。
const toast = useToastStore()

function showAlert(message: string, type: 'primary' | 'danger' = 'primary') {
  if (type === 'danger')
    toast.error(message)
  else
    toast.success(message)
}

const {
  systemConfigSaving,
  captureConfigSaving,
  captureConfigTesting,
  localSystemConfig,
  defaultSystemConfig,
  localCaptureConfig,
  platformOptions,
  osOptions,
  loadCaptureConfig,
  handleTestCaptureConfig,
  handleSaveCaptureConfig,
  loadSystemConfig,
  handleSaveSystemConfig,
  handleResetSystemConfig,
} = useAdminSystemConfig({ showAlert })

const {
  deviceProtocolLoading,
  deviceProtocolSaving,
  yybConfigLoading,
  deviceProtocolPresetOptions,
  selectedDevicePreset,
  deviceProtocolForm,
  yybConfig,
  fillRandomDeviceMac,
  fillRandomDeviceId,
  fillRandomImei,
  applyDevicePreset,
  fetchDeviceProtocol,
  fetchYYBConfig,
  handleSaveDeviceProtocol,
} = useUserSettings(showAlert)

onMounted(() => {
  loadSystemConfig()
  loadCaptureConfig()
  fetchDeviceProtocol()
  fetchYYBConfig()
})
</script>

<template>
  <div class="space-y-4">
    <YYBConfigCard
      v-model:config="yybConfig"
      :loading="yybConfigLoading"
    />

    <AdminSystemPanel
      v-model:local-system-config="localSystemConfig"
      v-model:local-capture-config="localCaptureConfig"
      section="system"
      :default-system-config="defaultSystemConfig"
      :platform-options="platformOptions"
      :os-options="osOptions"
      :system-config-saving="systemConfigSaving"
      :capture-config-saving="captureConfigSaving"
      :capture-config-testing="captureConfigTesting"
      @reset-system="handleResetSystemConfig"
      @save-system="handleSaveSystemConfig"
    />

    <DeviceProtocolCard
      v-model:form="deviceProtocolForm"
      v-model:selected-preset="selectedDevicePreset"
      :loading="deviceProtocolLoading"
      :saving="deviceProtocolSaving"
      :preset-options="deviceProtocolPresetOptions"
      :show-save="true"
      @apply-preset="applyDevicePreset"
      @random-mac="fillRandomDeviceMac"
      @random-device-id="fillRandomDeviceId"
      @random-imei="fillRandomImei"
      @save="handleSaveDeviceProtocol"
    />

    <AdminSystemPanel
      v-model:local-system-config="localSystemConfig"
      v-model:local-capture-config="localCaptureConfig"
      section="capture"
      :default-system-config="defaultSystemConfig"
      :platform-options="platformOptions"
      :os-options="osOptions"
      :system-config-saving="systemConfigSaving"
      :capture-config-saving="captureConfigSaving"
      :capture-config-testing="captureConfigTesting"
      @test-capture="handleTestCaptureConfig"
      @save-capture="handleSaveCaptureConfig"
    />
  </div>
</template>
