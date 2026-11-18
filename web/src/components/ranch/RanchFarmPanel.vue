<script setup lang="ts">
import type { RanchPanelAction } from '@/utils/ranch-panel'
import { useIntervalFn } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { useAccountStore } from '@/stores/account'
import { useRanchStore } from '@/stores/ranch'
import { ranchAnimalProgress, ranchSnapshotNow } from '@/utils/ranch-animal-progress'
import { ranchDate } from '@/utils/ranch-display'
import { positiveRanchCount } from '@/utils/ranch-input'
import { ranchPanelActions, runRanchPanelActions } from '@/utils/ranch-panel'
import RanchAnimalBubble from './RanchAnimalBubble.vue'
import RanchScene from './RanchScene.vue'

defineEmits<{ confirm: [title: string, message: string, payload: any] }>()
const store = useRanchStore()
const account = useAccountStore()
const running = ref(false)
const actionNotice = ref('')
const dialog = ref<'' | 'harvest' | 'place' | 'feed'>('')
const targetId = ref('')
const cubId = ref('')
const feedCount = ref('')
const imageErrors = ref<Record<string, boolean>>({})
const localNow = ref(Date.now())
function tick() {
  if (!document.hidden)
    localNow.value = Date.now()
}
useIntervalFn(tick, 1000)
onMounted(() => document.addEventListener('visibilitychange', tick))
let generation = 0
let mounted = true
const ranches = computed<any[]>(() => store.data?.ranches || [])
const animalCards = computed(() => ranches.value.map(ranch => ({ ...ranch, animals: (ranch.animals || []).map((animal: any) => ({ ...animal, progress: ranchAnimalProgress(animal, ranchSnapshotNow(store.data, localNow.value)) })) })))
const selectedRanchId = ref('')
const selectedAnimalId = ref('')
const animalAnchor = ref<HTMLElement | null>(null)
function selectAnimal(ranchId: string, animalId: string, anchor: HTMLElement) {
  animalAnchor.value = anchor
  selectedRanchId.value = ranchId
  selectedAnimalId.value = animalId
}
const selectedRanches = computed(() => animalCards.value.filter(r => String(r.ranchInstId) === selectedRanchId.value))
const selectedAnimal = computed(() => selectedRanches.value[0]?.animals.find((a: any) => String(a.animalInstId) === selectedAnimalId.value))
watch(ranches, (items) => {
  if (!items.some(r => String(r.ranchInstId) === selectedRanchId.value))
    selectedRanchId.value = ''
})
const facilities = computed<any[]>(() => store.data?.facilities || [])
const facilityLevels = computed(() => facilities.value.filter(f =>
  f.ranch || f.feedMachine || f.facilityKind === 'MODULE_TYPE_RANCH_SHED',
))
const feedMachines = computed<any[]>(() => (store.data?.facilities || []).filter((f: any) => f.feedMachine))
const disabled = computed(() => running.value || store.busy || store.loading)
const targets = computed(() => dialog.value === 'feed' ? feedMachines.value : ranches.value)
const target = computed(() => targets.value.find(t => String(t.ranchInstId ?? t.instId) === targetId.value))
const canSubmit = computed(() => dialog.value === 'harvest'
  ? ranchPanelActions(store.data, 'harvest').length > 0
  : dialog.value === 'feed'
    ? !!target.value && !!positiveRanchCount(feedCount.value)
    : !!target.value && (target.value.availableCubs || []).some((c: any) => String(c.itemId) === cubId.value))
const operations = [
  { action: 'collect', label: '收集产物', icon: 'i-carbon-wheat', color: 'bg-blue-600 hover:bg-blue-700' },
  { action: 'produce', label: '开始生产', icon: 'i-carbon-play', color: 'bg-green-600 hover:bg-green-700' },
  { action: 'clean', label: '清理灾害', icon: 'i-carbon-clean', color: 'bg-teal-600 hover:bg-teal-700' },
  { action: 'harvest', label: '收获动物', icon: 'i-carbon-checkmark', color: 'bg-orange-600 hover:bg-orange-700' },
] as const
const summary = computed(() => [
  { label: '可收集窝棚', count: ranchPanelActions(store.data, 'collect').length, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { label: '生产中动物', count: ranches.value.flatMap(r => r.animals || []).filter(a => a.producing).length, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { label: '窝棚', count: ranches.value.length, color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  { label: '待清理窝棚', count: ranchPanelActions(store.data, 'clean').length, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
])
function reset() {
  generation++
  selectedRanchId.value = ''
  selectedAnimalId.value = ''
  actionNotice.value = ''
  imageErrors.value = {}
  dialog.value = ''
  targetId.value = ''
  cubId.value = ''
  feedCount.value = ''
}
watch(() => account.currentAccountId, reset, { flush: 'sync' })
watch(targetId, () => {
  cubId.value = ''
})
onUnmounted(() => {
  mounted = false
  document.removeEventListener('visibilitychange', tick)
  generation++
})
function label(item: any) {
  return item?.name || item?.title || '—'
}
function animalKey(animal: any) {
  return String(animal.animalInstId)
}
function open(value: 'harvest' | 'place' | 'feed') {
  if (disabled.value)
    return
  dialog.value = value
  targetId.value = ''
  cubId.value = ''
  feedCount.value = ''
}
function requestOperation(action: RanchPanelAction) {
  if (disabled.value)
    return
  actionNotice.value = ''
  if (!ranchPanelActions(store.data, action).length) {
    actionNotice.value = store.data?.sectionErrors?.overview
      ? '牧场数据读取失败，请刷新后重试。'
      : !store.data?.sceneReady
          ? '牧场数据尚未就绪，请稍后重试。'
          : !store.data?.capabilities?.[action]
              ? '当前牧场暂不支持此操作。'
              : ({ collect: '没有可收集的产物。', produce: '没有可开始生产的动物。', clean: '没有可清理的灾害。', harvest: '没有可收获的动物。' })[action]
    return
  }
  if (action === 'harvest')
    open('harvest')
  else
    void execute(action)
}
async function execute(action: RanchPanelAction) {
  if (disabled.value)
    return
  const version = generation
  const accountId = account.currentAccountId
  running.value = true
  try {
    await runRanchPanelActions(action, {
      data: () => store.data,
      active: () => mounted && version === generation && account.currentAccountId === accountId,
      mutate: payload => store.mutate('/api/ranch/action', payload),
      failed: () => !!store.error,
    })
  }
  finally { running.value = false }
}
async function submit() {
  if (disabled.value || !canSubmit.value)
    return
  const action = dialog.value
  dialog.value = ''
  if (action === 'harvest') {
    await execute('harvest')
    return
  }
  const selected = targetsFor(action).find(t => String(t.ranchInstId ?? t.instId) === targetId.value)
  if (!selected)
    return
  if (action === 'feed')
    await store.mutate('/api/ranch/action', { action: 'addFeed', facilityInstId: selected.instId, count: positiveRanchCount(feedCount.value) })
  else
    await store.mutate('/api/ranch/action', { action: 'place', ranchId: selected.ranchInstId, itemId: cubId.value })
}
function targetsFor(action: string) {
  return action === 'feed' ? feedMachines.value : ranches.value
}
</script>

<template>
  <div class="ranch-farm-panel overflow-hidden rounded-lg">
    <div class="flex flex-col items-stretch justify-between gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center dark:border-gray-700">
      <div class="min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="flex shrink-0 items-center gap-2 text-lg font-bold">
          <span class="i-carbon-grid self-center text-xl" />牧场详情
        </h2>
        <span v-for="facility in facilityLevels" :key="facility.instId" class="text-xs text-gray-500 dark:text-gray-400">
          {{ label(facility) }} Lv.{{ facility.level ?? '—' }}
        </span>
      </div>
      <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
        <button v-for="op in operations" :key="op.action" class="flex items-center justify-center gap-1.5 rounded px-3 py-2 text-sm text-white transition disabled:cursor-not-allowed disabled:opacity-50" :class="op.color" :disabled="disabled" @click="requestOperation(op.action)">
          <span :class="op.icon" />{{ op.label }}
        </button>
        <button v-if="store.data?.capabilities?.place" class="flex items-center justify-center gap-1.5 rounded bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50" :disabled="disabled || !ranches.some(r => r.availableCubs?.length)" @click="open('place')">
          <span class="i-carbon-add" />幼崽入栏
        </button>
        <button v-if="store.data?.capabilities?.addFeed" class="flex items-center justify-center gap-1.5 rounded bg-teal-600 px-3 py-2 text-sm text-white hover:bg-teal-700 disabled:opacity-50" :disabled="disabled || !feedMachines.length" @click="open('feed')">
          <span class="i-carbon-sprout" />补充牧草
        </button>
      </div>
    </div>
    <p v-if="actionNotice" role="status" class="px-4 py-2 text-sm text-amber-600">
      {{ actionNotice }}
    </p>
    <div class="ranch-farm-summary grid grid-cols-2 gap-2 border-b border-white/40 p-3 text-xs sm:flex sm:flex-wrap sm:gap-4 dark:border-gray-700 dark:bg-gray-900/50 sm:p-4 sm:text-sm">
      <span v-for="stat in summary" :key="stat.label" class="rounded-full px-3 py-1 font-medium" :class="stat.color">{{ stat.label }}: {{ stat.count }}</span>
    </div>
    <div class="p-2 space-y-4 sm:p-4">
      <p v-if="store.data?.sectionErrors?.warehouse" class="text-sm text-amber-600" role="alert">
        库存读取失败：{{ store.data.sectionErrors.warehouse }}
      </p>
      <p v-if="store.data?.sectionErrors?.buildings" class="text-sm text-red-500" role="alert">
        设施读取失败：{{ store.data.sectionErrors.buildings }}
      </p>
      <RanchScene :ranches="animalCards" :facilities="facilities" :selected-id="selectedRanchId" @select="selectedRanchId = $event; selectedAnimalId = ''" @animal="selectAnimal" />
      <div v-if="!ranches.length" class="py-12 text-center text-gray-500">
        当前没有窝棚数据
      </div>
      <section v-for="ranch in selectedRanches.filter(() => !selectedAnimalId)" :key="ranch.ranchInstId" class="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 sm:items-center" @click.self="selectedRanchId = ''" @keydown.esc="selectedRanchId = ''">
        <div role="dialog" aria-modal="true" :aria-label="selectedAnimalId ? '动物详情' : '窝棚详情'" class="max-h-[80vh] w-full overflow-y-auto rounded-xl bg-white shadow-xl sm:max-w-lg dark:bg-gray-800">
          <button type="button" autofocus class="float-right m-3 rounded px-3 py-1 text-sm" @click="selectedRanchId = ''">
            关闭
          </button>
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30">
            <h3 class="flex items-center gap-2 font-bold">
              <span class="i-carbon-home text-green-500" />{{ label(ranch) }}
            </h3>
            <div class="flex flex-wrap gap-3 text-xs text-gray-500">
              <span>动物 {{ ranch.animalCount ?? ranch.animals?.length ?? 0 }}/{{ ranch.capacity ?? '—' }}</span><span>货架 {{ ranch.shelves?.length ?? 0 }}</span><span :class="ranch.hazards?.length ? 'text-red-500' : ''">灾害 {{ ranch.hazards?.length ?? 0 }}</span>
            </div>
          </div>
          <div class="p-3 sm:p-4">
            <div v-if="!ranch.animals?.length" class="py-6 text-center text-sm text-gray-400">
              暂无动物
            </div>
            <div v-else-if="selectedAnimalId" class="grid grid-cols-1 gap-3">
              <article v-for="animal in ranch.animals.filter((a: any) => String(a.animalInstId) === selectedAnimalId)" :key="animalKey(animal)" class="flex flex-col items-center border border-gray-100 rounded-lg bg-white p-3 text-center transition dark:border-gray-700 dark:bg-gray-800 hover:shadow-md">
                <div class="mb-2 h-16 w-16 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-700/50">
                  <img v-if="animal.image && !imageErrors[animalKey(animal)]" :src="animal.visual?.image || animal.image" :alt="label(animal)" class="max-h-full max-w-full object-contain" loading="lazy" @error="imageErrors[animalKey(animal)] = true">
                  <span v-else class="text-xl text-gray-400 font-bold">{{ label(animal).slice(0, 1) }}</span>
                </div>
                <strong class="w-full truncate text-sm" :title="label(animal)">{{ label(animal) }}</strong>
                <span class="mt-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">{{ animal.stageLabel || '状态待确认' }}{{ animal.producing ? ' · 生产中' : '' }}</span>
                <p class="mt-2 text-xs text-gray-400">
                  已生产 {{ animal.produceCount ?? '—' }} 次
                </p>
                <p v-if="animal.grassBlocked" class="mt-1 text-xs text-amber-600">
                  牧草不足
                </p>
                <p v-if="animal.canHarvest" class="mt-1 text-xs text-orange-600">
                  可收获动物
                </p>
                <p v-if="animal.canTriggerProduce" class="mt-1 text-xs text-green-600">
                  可开始生产
                </p>
                <div class="mt-3 w-full text-left">
                  <div class="flex flex-wrap justify-between gap-1 text-xs">
                    <span class="text-gray-500">{{ animal.progress.note }}</span><span v-if="animal.progress.deadline && animal.progress.remaining !== '0秒'" class="text-blue-600 font-medium dark:text-blue-400">{{ animal.progress.remaining }}</span>
                  </div>
                  <div v-if="animal.progress.percent !== null" class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700" role="progressbar" aria-label="阶段参考进度" :aria-valuenow="animal.progress.percent" :aria-valuemin="0" :aria-valuemax="100" title="按官方基础阶段时长计算，实际完成状态以服务器为准">
                    <div class="h-full rounded-full bg-blue-500 transition-all duration-1000" :style="{ width: `${animal.progress.percent}%` }" />
                  </div>
                  <p v-if="animal.progress.percent !== null" class="mt-1 text-right text-[10px] text-gray-400">
                    参考进度 {{ animal.progress.percent }}%
                  </p>
                  <p v-if="animal.progress.deadline" class="mt-1 break-words text-[10px] text-gray-400">
                    {{ animal.progress.label }} {{ ranchDate(animal.progress.deadline) }}
                  </p>
                </div>
              </article>
            </div>
            <p v-if="!selectedAnimalId && ranch.hazards?.length" class="mt-3 text-sm text-red-500">
              待清理灾害 {{ ranch.hazards.length }} 处
            </p>
            <div v-if="!selectedAnimalId && ranch.shelves?.length" class="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
              <div v-for="shelf in ranch.shelves" :key="shelf.slotIndex" class="rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-900/40">
                <span class="font-medium">货架 {{ Number(shelf.slotIndex) + 1 }} · 剩余 {{ shelf.totalRemain ?? '—' }}</span><p v-for="lot in shelf.lots || []" :key="lot.itemId" class="mt-1 text-gray-500">
                  {{ lot.name }} × {{ lot.remainNum }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
    <RanchAnimalBubble v-if="selectedAnimal && animalAnchor" :animal="selectedAnimal" :anchor="animalAnchor" :ranch-name="selectedRanches[0]?.name || '窝棚'" @close="selectedRanchId = ''; selectedAnimalId = ''" />
    <ConfirmModal :show="!!dialog" :title="dialog === 'harvest' ? '收获动物' : dialog === 'feed' ? '补充牧草' : '金券购买幼崽并入栏'" :message="dialog === 'harvest' ? `确认收获当前可收获的 ${ranchPanelActions(store.data, 'harvest').length} 只动物？动物将离栏回收，此操作不同于收集货架产物。` : dialog === 'place' ? '使用金券购买所选幼崽并入栏，消耗和容量由服务端校验。' : '仅补充库存牧草，不购买额外道具。'" :loading="disabled" :confirm-disabled="!canSubmit" @confirm="submit" @cancel="dialog = ''" @close="dialog = ''">
      <div v-if="dialog !== 'harvest'" class="mt-4 text-left space-y-3">
        <label class="block text-sm">{{ dialog === 'feed' ? '牧草机' : '窝棚' }}<select v-model="targetId" class="mt-1 w-full border rounded-lg bg-transparent p-2"><option value="" disabled>请选择</option><option v-for="item in targets" :key="item.ranchInstId ?? item.instId" :value="String(item.ranchInstId ?? item.instId)">{{ label(item) }}</option></select></label>
        <label v-if="dialog === 'place'" class="block text-sm">幼崽<select v-model="cubId" class="mt-1 w-full border rounded-lg bg-transparent p-2" :disabled="!target"><option value="" disabled>请选择幼崽</option><option v-for="cub in target?.availableCubs || []" :key="cub.itemId" :value="String(cub.itemId)">{{ cub.name }}</option></select></label>
        <label v-else class="block text-sm">补充数量<input v-model="feedCount" type="number" min="1" step="1" class="mt-1 w-full border rounded-lg bg-transparent p-2"></label>
      </div>
    </ConfirmModal>
  </div>
</template>
