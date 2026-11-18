<script setup lang="ts">
import { ref } from 'vue'
import { positiveRanchCount } from '@/utils/ranch-input'

const props = defineProps<{ facility: any, disabled: boolean }>()
const emit = defineEmits<{ feed: [payload: { facilityInstId: string, count: number }] }>()
const count = ref('')
function submit() {
  const n = positiveRanchCount(count.value)
  if (n && !props.disabled)
    emit('feed', { facilityInstId: props.facility.instId, count: n })
}
</script>

<template>
  <div class="mt-3 space-y-3">
    <p class="text-sm">
      牧草 {{ facility.feedMachine?.feedCount ?? '—' }} / {{ facility.capacity ?? '—' }} · 消耗 {{ facility.feedMachine?.consumeRate ?? '—' }} · 剩余 {{ facility.feedMachine?.remainingSecs ?? '—' }} 秒
    </p><div class="flex flex-wrap items-center gap-2">
      <label class="text-sm">补充数量 <input v-model="count" type="number" min="1" step="1" inputmode="numeric" class="w-24 border rounded-lg bg-transparent p-2" :disabled="disabled"></label><button class="border rounded-lg px-3 py-2 text-sm disabled:opacity-40" :disabled="disabled || !positiveRanchCount(count)" @click="submit">
        补充库存牧草
      </button>
    </div>
  </div>
</template>
