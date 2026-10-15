<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

export interface NavEntry {
  path: string
  label: string
  icon: string
}

const props = withDefaults(defineProps<{
  items: NavEntry[]
  /** 弹出方向：up = 向上（移动端底栏），right = 向右（PC 侧边栏） */
  direction?: 'up' | 'right'
}>(), { direction: 'up' })

const route = useRoute()
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

function isActive() {
  return props.items.some(item => route.path === item.path)
}

function onDocClick(event: MouseEvent) {
  if (open.value && rootRef.value && !rootRef.value.contains(event.target as Node))
    open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="rootRef" class="nav-more" :class="[`direction-${direction}`, { active: isActive() }]">
    <button class="more-trigger" :class="{ open }" @click.stop="open = !open">
      <span class="more-icon more-icon-dots">
        <i /><i /><i />
      </span>
      <span class="more-label">更多</span>
    </button>

    <Transition name="more-pop">
      <div v-if="open" class="more-popover" @click.stop>
        <RouterLink
          v-for="item in items"
          :key="item.path"
          :to="item.path"
          class="more-item"
          :class="{ current: route.path === item.path }"
          @click="open = false"
        >
          <div class="more-item-icon" :class="[item.icon]" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.nav-more {
  position: relative;
}

.more-trigger {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #fff;
  transition: all 0.2s ease;
}

.more-icon-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.more-icon-dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.more-popover {
  position: absolute;
  z-index: 60;
  min-width: 150px;
  padding: 6px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 12px 32px rgba(31, 38, 80, 0.18);
}

.direction-up .more-popover {
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
}

.direction-right .more-popover {
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
}

.more-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #3d4a3f;
  text-decoration: none;
  transition: all 0.15s ease;
}

.more-item:hover {
  background: rgba(46, 204, 113, 0.12);
  color: #1f9d55;
}

.more-item.current {
  background: rgba(46, 204, 113, 0.16);
  color: #1f9d55;
  font-weight: 600;
}

.more-item-icon {
  font-size: 17px;
}

.more-pop-enter-active,
.more-pop-leave-active {
  transition: all 0.18s ease;
}

.more-pop-enter-from,
.more-pop-leave-to {
  opacity: 0;
}

.direction-up .more-pop-enter-from,
.direction-up .more-pop-leave-to {
  transform: translateY(6px) translateX(-50%);
}

.direction-right .more-pop-enter-from,
.direction-right .more-pop-leave-to {
  transform: translateY(-50%) translateX(6px);
}
</style>
