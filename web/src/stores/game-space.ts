import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type GameSpace = 'farm' | 'ranch'

const STORAGE_KEY = 'qq-farm-game-space'

function readSpace(): GameSpace {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ranch' ? 'ranch' : 'farm'
  }
  catch {
    return 'farm'
  }
}

export const useGameSpaceStore = defineStore('game-space', () => {
  const space = ref<GameSpace>(readSpace())
  const isRanch = computed(() => space.value === 'ranch')
  const spaceLabel = computed(() => isRanch.value ? '牧场' : '农场')
  const personalPath = computed(() => isRanch.value ? '/ranch/personal' : '/personal')

  watch(space, (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value)
    }
    catch {
      // 隐私模式或存储空间不足时，仍允许在当前会话切换。
    }
  }, { flush: 'sync' })

  function setSpace(value: GameSpace) {
    space.value = value
  }

  return { space, isRanch, spaceLabel, personalPath, setSpace }
})
