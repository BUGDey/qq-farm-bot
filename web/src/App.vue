<script setup lang="ts">
import { RouterView } from 'vue-router'
import ToastContainer from '@/components/ToastContainer.vue'
</script>

<template>
  <div class="app-root h-screen w-screen overflow-hidden" :style="{ color: 'var(--theme-text)' }">
    <RouterView />
    <ToastContainer />
  </div>
</template>

<style>
/* Global styles */
body {
  margin: 0;
  font-family: 'DM Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  line-height: 1.5;
  font-optical-sizing: auto;
  background: var(--app-bg);
  color: var(--theme-text);
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
}

/* Color theme variables - Dashboard Theme */
:root {
  --theme-bg: transparent;
  --theme-text: #2c3e50;
  --theme-primary: #2ecc71;
  --theme-secondary: #3498db;
  --theme-gradient: linear-gradient(135deg, #2ecc71 0%, #3498db 100%);
  --app-bg: transparent;
  --surface-1: rgba(255, 255, 255, 0.75);
  --surface-2: rgba(255, 255, 255, 0.6);
  --surface-3: rgba(255, 255, 255, 0.45);
  --surface-border: rgba(255, 255, 255, 0.5);
  --surface-border-strong: rgba(255, 255, 255, 0.6);
  --surface-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  --surface-shadow-soft: 0 2px 12px rgba(0, 0, 0, 0.06);
  --muted-text: #7f8c8d;
  --input-bg: rgba(255, 255, 255, 0.88);
  --panel-glow: rgba(46, 204, 113, 0.08);
}

.dark {
  --app-bg: transparent;
  --surface-1: rgba(255, 255, 255, 0.08);
  --surface-2: rgba(255, 255, 255, 0.06);
  --surface-3: rgba(255, 255, 255, 0.04);
  --surface-border: rgba(255, 255, 255, 0.1);
  --surface-border-strong: rgba(255, 255, 255, 0.15);
  --surface-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  --surface-shadow-soft: 0 2px 12px rgba(0, 0, 0, 0.2);
  --muted-text: #95a5a6;
  --input-bg: rgba(0, 0, 0, 0.3);
  --panel-glow: rgba(46, 204, 113, 0.06);
}

.app-root {
  background: var(--app-bg);
}

/* SaaS surface system */
.bg-white {
  background-color: var(--surface-1) !important;
}

.dark .bg-gray-800,
.dark .bg-gray-900 {
  background-color: var(--surface-1) !important;
}

.bg-gray-50 {
  background-color: var(--surface-2) !important;
}

.dark .bg-gray-700 {
  background-color: var(--surface-3) !important;
}

.ui-card {
  border: 1px solid var(--surface-border);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-1) 90%, rgba(34, 197, 94, 0.04) 10%),
    var(--surface-1)
  );
  box-shadow: var(--surface-shadow-soft);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.ui-card-elevated {
  border: 1px solid var(--surface-border-strong);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-1) 86%, rgba(34, 197, 94, 0.06) 14%),
    var(--surface-1)
  );
  box-shadow: var(--surface-shadow);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.ui-subtle-panel {
  border: 1px solid var(--surface-border);
  background: color-mix(in srgb, var(--surface-2) 80%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.glass-panel {
  border: 1px solid var(--surface-border);
  background: color-mix(in srgb, var(--surface-1) 72%, transparent);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: var(--surface-shadow-soft);
}

.metric-card {
  position: relative;
  overflow: hidden;
}

.metric-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(135deg, var(--panel-glow), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.14), transparent 34%);
}

.metric-card > * {
  position: relative;
}

.shadow,
.shadow-sm,
.shadow-md {
  box-shadow: var(--surface-shadow-soft) !important;
}

/* Use CSS variables for theme colors */
.btn-primary {
  background: var(--theme-gradient);
  border-color: var(--theme-primary);
}

.btn-primary:hover {
  background: var(--theme-secondary);
}

.text-primary {
  color: var(--theme-primary);
}

.bg-primary {
  background-color: var(--theme-primary);
}

.border-primary {
  border-color: var(--theme-primary);
}

.bg-gradient-primary {
  background: var(--theme-gradient);
}

/* 管理后台弹窗统一磨砂：白底略高保证表单可读，遮罩由各弹窗自行用 bg-black/30+模糊 */
.modal-glass {
  border: 1.5px solid rgba(255, 255, 255, 0.65);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(186, 226, 248, 0.26) 0%, rgba(255, 255, 255, 0.08) 45%, rgba(134, 214, 152, 0.3) 100%),
    linear-gradient(165deg, rgba(255, 255, 255, 0.84) 0%, rgba(255, 255, 255, 0.64) 100%);
  box-shadow:
    0 18px 44px rgba(31, 38, 80, 0.18),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px) saturate(1.35);
  -webkit-backdrop-filter: blur(12px) saturate(1.35);
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--theme-primary) 40%, #94a3b8);
  border-radius: 999px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--theme-secondary);
  opacity: 0.8;
}

/* Pastoral decorative floating leaves animation */
@keyframes float-leaf {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
    opacity: 0.6;
  }
  50% {
    transform: translateY(-20px) rotate(15deg);
    opacity: 0.8;
  }
}

.pastoral-leaf {
  position: absolute;
  pointer-events: none;
  animation: float-leaf 6s ease-in-out infinite;
}

.pastoral-leaf:nth-child(2) {
  animation-delay: 2s;
  animation-duration: 8s;
}

.pastoral-leaf:nth-child(3) {
  animation-delay: 4s;
  animation-duration: 7s;
}
</style>
