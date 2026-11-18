<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ranchDate } from '@/utils/ranch-display'

const props = defineProps<{ animal: any, anchor: HTMLElement, ranchName: string }>()
const emit = defineEmits<{ close: [] }>()
const bubble = ref<HTMLElement | null>(null)
const style = ref<Record<string, string>>({ visibility: 'hidden' })
const below = ref(false)
async function position() {
  await nextTick()
  if (!bubble.value || !props.anchor.isConnected)
    return
  const rect = props.anchor.getBoundingClientRect()
  const width = bubble.value.offsetWidth
  const height = bubble.value.offsetHeight
  below.value = rect.top < height + 18 && window.innerHeight - rect.bottom > rect.top
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))
  const top = Math.max(8, Math.min(window.innerHeight - height - 8, below.value ? rect.bottom + 12 : rect.top - height - 12))
  style.value = { 'left': `${left}px`, 'top': `${top}px`, '--arrow-left': `${Math.max(20, Math.min(width - 20, rect.left + rect.width / 2 - left))}px` }
}
function outside(event: PointerEvent) {
  if (!bubble.value?.contains(event.target as Node) && !props.anchor.contains(event.target as Node))
    emit('close')
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
    props.anchor.focus()
  }
}
function scroll(event: Event) {
  if (!bubble.value?.contains(event.target as Node))
    void position()
}
watch(() => [props.anchor, props.animal.animalInstId], position, { flush: 'post' })
onMounted(() => {
  void position()
  document.addEventListener('pointerdown', outside)
  document.addEventListener('keydown', keydown)
  window.addEventListener('resize', position)
  window.addEventListener('scroll', scroll, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('keydown', keydown)
  window.removeEventListener('resize', position)
  window.removeEventListener('scroll', scroll, true)
})
</script>

<template>
  <Teleport to="body">
    <aside ref="bubble" role="dialog" :aria-label="`${animal.name}详情`" class="animal-bubble" :class="{ below }" :style="style" @click.stop>
      <div class="bubble-content">
        <header class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs text-gray-400">
              {{ ranchName }} · 动物 #{{ animal.animalInstId }}
            </p>
            <h3 class="mt-1 break-words text-base font-bold">
              {{ animal.name }}
            </h3>
          </div>
          <span class="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs text-green-700">{{ animal.stageLabel || '状态待确认' }}</span>
        </header>
        <div class="grid grid-cols-2 my-3 gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-700/30">
          <div>
            <p class="text-xs text-gray-400">
              {{ animal.progress.label }}倒计时
            </p><p class="mt-1 break-words text-sm font-semibold">
              {{ animal.progress.remaining || '—' }}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-400">
              已生产次数
            </p><p class="mt-1 text-sm font-semibold">
              {{ animal.produceCount ?? '—' }}
            </p>
          </div>
        </div>
        <section class="rounded-xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
          <div class="flex justify-between gap-2 text-sm">
            <span>{{ animal.progress.note }}</span><span v-if="animal.progress.percent !== null">{{ animal.progress.percent }}%</span>
          </div>
          <div v-if="animal.progress.percent !== null" class="my-2 h-2 overflow-hidden rounded-full bg-emerald-100" role="progressbar" aria-label="阶段参考进度" :aria-valuenow="animal.progress.percent" :aria-valuemin="0" :aria-valuemax="100">
            <div class="h-full rounded-full bg-emerald-500" :style="{ width: `${animal.progress.percent}%` }" />
          </div>
          <p v-if="animal.progress.deadline" class="mt-2 text-xs opacity-60">
            {{ animal.progress.label }} {{ ranchDate(animal.progress.deadline) }}
          </p>
        </section>
        <section v-if="animal.mutation?.mutationType === 1 || animal.grassBlocked || animal.canHarvest || animal.canTriggerProduce" class="mt-3 rounded-xl bg-pink-50 p-3 text-sm text-pink-600 dark:bg-pink-900/20 dark:text-pink-300">
          <p v-if="animal.mutation?.mutationType === 1">
            {{ animal.mutation.tier >= 4 ? '超巨化' : '巨化' }}<span v-if="animal.mutation.tier"> · {{ animal.mutation.tier }} 阶</span>
          </p>
          <p v-if="animal.grassBlocked">
            牧草不足
          </p><p v-if="animal.canHarvest">
            可收获动物
          </p><p v-if="animal.canTriggerProduce">
            可开始生产
          </p>
        </section>
        <button type="button" class="mt-3 w-full border border-gray-200 rounded-lg py-2 text-sm text-gray-500 dark:border-gray-600" @click="emit('close')">
          关闭
        </button>
      </div>
    </aside>
  </Teleport>
</template>

<style scoped>
.animal-bubble {
  position: fixed;
  z-index: 100;
  width: min(340px, calc(100vw - 16px));
  border: 1px solid #dce5ed;
  border-radius: 18px;
  background: #fffffff5;
  color: #1e293b;
  box-shadow: 0 12px 35px #172b4d26;
}
.bubble-content {
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 18px;
  border-radius: inherit;
}
.animal-bubble::after {
  content: '';
  position: absolute;
  left: var(--arrow-left);
  bottom: -8px;
  width: 14px;
  height: 14px;
  background: #fff;
  border-right: 1px solid #dce5ed;
  border-bottom: 1px solid #dce5ed;
  transform: translateX(-50%) rotate(45deg);
}
.animal-bubble.below::after {
  bottom: auto;
  top: -8px;
  transform: translateX(-50%) rotate(225deg);
}
:global(.dark) .animal-bubble {
  background: #1f2937;
  color: #e5e7eb;
  border-color: #475569;
}
:global(.dark) .animal-bubble::after {
  background: #1f2937;
  border-color: #475569;
}
</style>
