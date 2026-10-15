<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'sm' | 'md'
}>(), { size: 'md' })
</script>

<template>
  <div class="game-logo" :class="size === 'sm' ? 'game-logo-sm' : ''">
    <div class="logo-title">
      <span>QQ农场</span>
      <div class="logo-leaf i-fas-leaf" />
    </div>
    <div class="logo-subtitle">
      种下希望 收获快乐
    </div>
  </div>
</template>

<style scoped>
.game-logo {
  display: inline-flex;
  flex-direction: column;
  line-height: 1.15;
  user-select: none;
  white-space: nowrap;
}

.logo-title {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  white-space: nowrap;
  font-size: 34px;
  font-weight: 900;
  font-style: italic;
  letter-spacing: 2px;
  color: #fff;
  text-shadow:
    0 2px 0 rgba(46, 139, 87, 0.55),
    0 6px 16px rgba(31, 38, 80, 0.35);
}

.logo-leaf {
  margin-top: 2px;
  font-size: 16px;
  color: #7ef29a;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.25));
}

.logo-subtitle {
  margin-top: 2px;
  padding-left: 6px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 4px;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 2px 6px rgba(31, 38, 80, 0.35);
}

.game-logo-sm .logo-title {
  font-size: 26px;
}

.game-logo-sm .logo-subtitle {
  font-size: 11px;
}
</style>
