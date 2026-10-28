<script setup lang="ts">
import { computed } from 'vue'
import { APP_VERSION, UPDATE_LOGS } from '@/data/update-log'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const logs = computed(() => UPDATE_LOGS)
</script>

<template>
  <Teleport to="body">
    <Transition name="ulog">
      <div
        v-if="props.show"
        class="ulog-overlay"
        role="dialog"
        aria-modal="true"
        @click.self="emit('close')"
      >
        <section class="ulog-panel">
          <header class="ulog-header">
            <div>
              <h2>更新日志</h2>
              <p>当前版本 v{{ APP_VERSION }} · 历史更新全部保留</p>
            </div>
            <button type="button" class="ulog-close" aria-label="关闭更新日志" @click="emit('close')">
              <div class="i-carbon-close" />
            </button>
          </header>

          <div class="ulog-body">
            <article v-for="log in logs" :key="log.version" class="ulog-entry">
              <div class="ulog-entry-head">
                <span class="ulog-version">v{{ log.version }}</span>
                <span class="ulog-date">{{ log.date }}</span>
              </div>
              <ul>
                <li v-for="(item, index) in log.items" :key="index">
                  {{ item }}
                </li>
              </ul>
            </article>
          </div>

          <footer class="ulog-footer">
            <button type="button" class="bg-gradient-primary w-full rounded-xl py-2.5 text-sm text-white font-semibold transition sm:w-auto sm:px-6 hover:opacity-90" @click="emit('close')">
              我知道了
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ulog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(6px);
}

.ulog-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(620px, 100%);
  max-height: min(82vh, 720px);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 26px 72px rgba(15, 23, 42, 0.24);
}

.ulog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 14px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.ulog-header h2 {
  margin: 0;
  color: #1f2937;
  font-size: 1.15rem;
  font-weight: 700;
}

.ulog-header p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 0.78rem;
}

.ulog-close {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 10px;
  color: #64748b;
  cursor: pointer;
  background: transparent;
  transition: 0.2s ease;
}

.ulog-close:hover {
  color: #1f2937;
  background: #f3f4f6;
  border-color: rgba(15, 23, 42, 0.08);
}

.ulog-body {
  min-height: 0;
  padding: 16px 22px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ulog-entry + .ulog-entry {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed rgba(15, 23, 42, 0.1);
}

.ulog-entry-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ulog-version {
  padding: 2px 9px;
  border-radius: 999px;
  color: #15803d;
  background: rgba(34, 197, 94, 0.12);
  font-size: 0.8rem;
  font-weight: 700;
}

.ulog-date {
  color: #9ca3af;
  font-size: 0.76rem;
}

.ulog-entry ul {
  display: grid;
  gap: 7px;
  margin: 10px 0 0;
  padding-left: 18px;
  color: #374151;
  font-size: 0.86rem;
  line-height: 1.7;
}

.ulog-entry li::marker {
  color: #22c55e;
}

.ulog-footer {
  display: flex;
  justify-content: flex-end;
  padding: 14px 22px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(249, 250, 251, 0.9);
}

.ulog-enter-active,
.ulog-leave-active {
  transition: opacity 0.2s ease;
}

.ulog-enter-active .ulog-panel,
.ulog-leave-active .ulog-panel {
  transition: transform 0.2s ease;
}

.ulog-enter-from,
.ulog-leave-to {
  opacity: 0;
}

.ulog-enter-from .ulog-panel,
.ulog-leave-to .ulog-panel {
  transform: translateY(10px);
}

@media (max-width: 640px) {
  .ulog-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .ulog-panel {
    width: 100%;
    max-height: 90vh;
    border-radius: 20px 20px 0 0;
  }
}
</style>
