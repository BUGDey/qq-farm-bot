<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ facility: any, animals?: any[] }>(), { animals: () => [] })
const emit = defineEmits<{ animal: [animal: any, anchor: HTMLElement], facility: [] }>()
const layers = computed(() => props.facility.visual?.layers || [])
const bounds = computed(() => {
  if (!layers.value.length)
    return { left: -500, right: 500, bottom: -260, top: 350 }
  return {
    left: Math.min(...layers.value.map((layer: any) => layer.x - layer.width * layer.scaleX * layer.anchorX)),
    right: Math.max(...layers.value.map((layer: any) => layer.x + layer.width * layer.scaleX * (1 - layer.anchorX))),
    bottom: Math.min(...layers.value.map((layer: any) => layer.y - layer.height * layer.scaleY * layer.anchorY)),
    top: Math.max(...layers.value.map((layer: any) => layer.y + layer.height * layer.scaleY * (1 - layer.anchorY))),
  }
})
function layerStyle(layer: any) {
  const box = bounds.value
  return {
    left: `${(layer.x - layer.width * layer.scaleX * layer.anchorX - box.left) / (box.right - box.left) * 100}%`,
    top: `${(box.top - layer.y - layer.height * layer.scaleY * (1 - layer.anchorY)) / (box.top - box.bottom) * 100}%`,
    width: `${layer.width * layer.scaleX / (box.right - box.left) * 100}%`,
    height: `${layer.height * layer.scaleY / (box.top - box.bottom) * 100}%`,
    zIndex: layer.front ? 30 : 1,
  }
}
function animalStyle(index: number, animal: any) {
  const count = Math.max(1, props.animals.length)
  const columns = Math.min(5, count)
  const rows = Math.ceil(count / columns)
  const row = Math.floor(index / columns)
  return { left: `${20 + ((index % columns) + 0.5) * 62 / columns}%`, top: `${50 + (row + 0.5) * 34 / rows}%`, width: `${Math.min(22, 65 / columns, 42 / rows)}%`, transform: `translate(-50%, -85%) scale(${animal.visual?.scale || 1})`, transformOrigin: '50% 100%', zIndex: 10 + row }
}
</script>

<template>
  <div class="ranch-facility-scene relative mx-auto my-3 w-full overflow-hidden rounded-xl" :style="{ aspectRatio: `${bounds.right - bounds.left} / ${bounds.top - bounds.bottom}` }" :aria-label="`${facility.name || '设施'}，${animals.length} 只动物`">
    <img v-for="layer in layers" :key="layer.image" :src="layer.image" alt="" class="pointer-events-none absolute object-fill" :style="layerStyle(layer)" loading="lazy">
    <button type="button" class="absolute border-0 rounded-lg bg-transparent focus-visible:outline" style="left: 55%; top: 10%; width: 32%; height: 36%; z-index: 9" :aria-label="`${facility.name || '窝棚'}，查看设施详情`" @click.stop="emit('facility')" />
    <button v-for="(animal, index) in animals" :key="animal.animalInstId" type="button" class="animal-target absolute border-0 bg-transparent p-0" :style="animalStyle(index, animal)" :aria-label="`${animal.name} · ${animal.stageLabel}，查看详情`" @click.stop="emit('animal', animal, $event.currentTarget as HTMLElement)">
      <img v-if="animal.visual?.image" :src="animal.visual.image" :alt="animal.name" class="block w-full object-contain" loading="lazy">
      <span v-else class="rounded bg-white/90 p-1 text-xs">{{ animal.name }} · 图像缺失</span>
    </button>
    <div v-if="!layers.length" class="flex items-center justify-center gap-2 p-8 text-sm text-gray-400">
      <span class="i-carbon-home" />暂无设施图像
    </div>
  </div>
</template>

<style scoped>
.animal-target {
  cursor: pointer;
}
.animal-target:focus-visible {
  outline: 2px solid #426d31;
  border-radius: 12px;
}
.animal-target:hover {
  filter: drop-shadow(0 0 4px #ffffff);
}
</style>
