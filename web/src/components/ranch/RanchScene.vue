<script setup lang="ts">
import RanchFacilityScene from './RanchFacilityScene.vue'

defineProps<{ ranches: any[], facilities: any[], selectedId?: string, title?: string }>()
const emit = defineEmits<{ select: [id: string], animal: [ranchId: string, animalId: string, anchor: HTMLElement] }>()
function facilityFor(ranch: any, facilities: any[]) {
  return facilities.find(f => String(f.ranch?.ranchInstId) === String(ranch.ranchInstId)) || { name: ranch.name }
}
</script>

<template>
  <div class="ranch-scene">
    <div class="scene-heading">
      <span class="flex items-center gap-2"><span class="i-carbon-sprout" />{{ title || '我的牧场' }}</span>
    </div>
    <div class="scene-paddocks">
      <section v-for="ranch in ranches" :key="ranch.ranchInstId" class="paddock">
        <div class="paddock-label w-full">
          {{ ranch.name }} <span class="font-normal opacity-70">{{ ranch.animalCount ?? ranch.animals?.length ?? 0 }}/{{ ranch.capacity ?? '—' }}</span>
        </div>
        <RanchFacilityScene v-if="facilityFor(ranch, facilities).visual?.layers?.length" :facility="facilityFor(ranch, facilities)" :animals="ranch.animals || []" @facility="emit('select', String(ranch.ranchInstId))" @animal="(animal, anchor) => emit('animal', String(ranch.ranchInstId), String(animal.animalInstId), anchor)" />
        <div v-else class="fallback-pasture">
          <span class="i-carbon-home absolute left-4 top-4 text-3xl opacity-40" />
          <span v-if="!ranch.animals?.length" class="text-sm opacity-60">空闲窝棚</span>
          <button v-for="animal in ranch.animals || []" :key="animal.animalInstId" type="button" class="fallback-animal" @click="emit('animal', String(ranch.ranchInstId), String(animal.animalInstId), $event.currentTarget as HTMLElement)">
            <img v-if="animal.visual?.image || animal.image" :src="animal.visual?.image || animal.image" :alt="animal.name" loading="lazy">
            <span v-else>{{ animal.name }}</span>
          </button>
        </div>
        <span class="paddock-status">
          <button v-if="ranch.shelves?.length" type="button" class="rounded-full bg-white/80 px-2 py-1 text-xs" @click="emit('select', String(ranch.ranchInstId))">货架 {{ ranch.shelves.length }}</button>
          <span v-if="ranch.shelves?.some((s: any) => s.canCollect)" class="bg-amber-100 text-amber-800">可收集产物</span>
          <button v-if="ranch.hazards?.length" type="button" class="rounded-full bg-red-100 px-2 py-1 text-xs text-red-800" @click="emit('select', String(ranch.ranchInstId))">待清理 {{ ranch.hazards.length }}</button>
          <span v-if="ranch.animals?.some((a: any) => a.grassBlocked)" class="bg-orange-100 text-orange-800">牧草不足</span>
        </span>
      </section>
    </div>
    <p v-if="!ranches.length" class="py-12 text-center text-sm text-green-900/60">
      当前没有窝棚数据
    </p>
  </div>
</template>

<style scoped>
.ranch-scene {
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
  width: 100%;
  max-width: 1440px;
  margin-inline: auto;
  padding: clamp(16px, 2.5vw, 30px);
  border-radius: 20px;
  background-color: #c8dda6;
  background-image: linear-gradient(#f1f8df25, #e5efcc18), url('/ranch/pasture-background.webp');
  background-size: cover;
  background-position: center 48%;
  color: #365139;
  box-shadow: inset 0 0 0 1px #709a5030;
}
.scene-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-weight: 700;
  text-shadow: 0 1px 3px #ffffff;
}
.scene-paddocks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 620px));
  gap: clamp(16px, 3vw, 40px);
  align-items: start;
  justify-content: center;
}
.paddock {
  min-width: 0;
  position: relative;
  padding: 8px;
  border-radius: 16px;
  background: transparent;
  text-align: left;
}
/* The official fence defines the enclosure, not a second card border. */
.paddock-label {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 8px;
  background: #f5fae8b3;
}
.paddock-status {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 32px;
  align-content: start;
}
.paddock-status > span {
  border-radius: 20px;
  padding: 3px 8px;
  font-size: 11px;
}
.fallback-pasture {
  position: relative;
  min-height: 180px;
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  justify-content: center;
  gap: 12px;
  margin: 18px 4px;
  padding: 32px 12px 16px;
  border: 5px double #a88a58;
  border-radius: 40% 40% 20% 20%;
  background: #8eb96940;
}
.fallback-animal {
  width: 56px;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.fallback-animal img {
  width: 100%;
  height: 64px;
  object-fit: contain;
}
@media (min-width: 1200px) {
  .scene-paddocks {
    grid-template-columns: repeat(auto-fit, minmax(320px, 620px));
  }
}
@media (max-width: 600px) {
  .ranch-scene {
    padding: 14px;
    border-radius: 14px;
  }
  .scene-paddocks {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
}
</style>
