<script setup lang="ts">
/**
 * 故友重逢 · 只读规则展示面板
 *
 * 依据 2026-11-18 真实 HAR 抓包：
 * - 父活动 2026111800（type=1、status 未下发），子活动 2026111801（type=11、uid=FriendRecallUI）。
 * - Operate {id:"2026111801", cmd:17} 仅回显 group，无任何结果字段，零领奖样本。
 * - 因此本面板只展示活动规则与 buff，严禁编码任何召回 / 领礼包 / 自动化动作。
 */
import { computed } from 'vue'

const props = defineProps<{
  title?: string
  activityIds?: number[]
  window?: { startMs: number, endMs: number } | null
}>()

const emit = defineEmits<{ back: [] }>()

// 抓包确认的规则原文，逐字展示，不臆测未证实字段
const RULE_TEXT = '召回老友领奖 + 社交互动掉重逢礼包；活跃玩家每日上限 10、回归玩家 15、30 天冷却、召回礼包前 10 位才有奖'

// 子活动 payload 中确认下发的 buffList
const BUFFS: Array<{ id: number, name: string }> = [
  { id: 1001, name: '经验提升' },
  { id: 100601, name: '更多重逢礼包上限' },
]

// 只有服务端确实下发了 start/end（非零）才格式化，否则按游戏内为准
const timeWindowText = computed(() => {
  const startMs = Number(props.window?.startMs || 0)
  const endMs = Number(props.window?.endMs || 0)
  if (!startMs || !endMs)
    return '时间以游戏内为准'
  const fmt = (ms: number) => new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(new Date(ms))
  return `${fmt(startMs)} — ${fmt(endMs)}`
})
</script>

<template>
  <div class="friend-recall">
    <button
      type="button"
      class="friend-recall__back"
      @click="emit('back')"
    >
      <span class="i-carbon-arrow-left" />
      返回活动列表
    </button>

    <section class="friend-recall__hero">
      <div class="friend-recall__hero-icon" aria-hidden="true">
        <span class="i-carbon-group" />
      </div>
      <div class="friend-recall__hero-copy">
        <span class="friend-recall__eyebrow">QQ 农场 · 故友重逢</span>
        <h1 class="friend-recall__title">
          {{ title || '故友重逢' }}
        </h1>
        <p class="friend-recall__time">
          <span class="i-carbon-time" />
          {{ timeWindowText }}
        </p>
      </div>
    </section>

    <section class="friend-recall__card">
      <div class="friend-recall__card-head">
        <span class="i-carbon-information" />
        <h2>活动规则</h2>
      </div>
      <p class="friend-recall__rule">
        {{ RULE_TEXT }}
      </p>
    </section>

    <section class="friend-recall__card">
      <div class="friend-recall__card-head">
        <span class="i-carbon-chart-line" />
        <h2>活动增益</h2>
      </div>
      <div class="friend-recall__buffs">
        <article
          v-for="buff in BUFFS"
          :key="buff.id"
          class="friend-recall__buff"
        >
          <span class="i-carbon-checkmark-outline friend-recall__buff-icon" />
          <span class="friend-recall__buff-name">{{ buff.name }}</span>
          <span class="friend-recall__buff-code">#{{ buff.id }}</span>
        </article>
      </div>
    </section>

    <div class="friend-recall__notice">
      <span class="i-carbon-warning-alt" />
      <span>召回与领奖请在游戏内完成，本页仅展示活动规则</span>
    </div>
  </div>
</template>

<style scoped>
.friend-recall {
  --fr-text: #243247;
  --fr-muted: #526176;
  --fr-border: rgba(255, 255, 255, 0.7);
  --fr-surface: linear-gradient(165deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.52));
  color: var(--fr-text);
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
}

.friend-recall__back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--fr-muted);
  font-size: 14px;
  cursor: pointer;
  transition: color 0.15s ease;
}
.friend-recall__back:hover {
  color: var(--fr-text);
}

.friend-recall__hero {
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid var(--fr-border);
  border-radius: 16px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-primary) 16%, #ffffffcc), color-mix(in srgb, var(--theme-primary) 6%, #ffffff88));
  box-shadow: 0 8px 24px rgba(31, 38, 87, 0.08), inset 0 1px rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px) saturate(1.25);
  -webkit-backdrop-filter: blur(20px) saturate(1.25);
  padding: 20px;
}
.friend-recall__hero-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 56px;
  height: 56px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 18px;
  background: color-mix(in srgb, var(--theme-primary) 12%, transparent);
  color: var(--theme-primary);
  font-size: 30px;
}
.friend-recall__hero-copy {
  min-width: 0;
}
.friend-recall__eyebrow {
  display: block;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--theme-primary);
}
.friend-recall__title {
  margin: 2px 0 0;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.friend-recall__time {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--fr-muted);
}

.friend-recall__card {
  border: 1px solid var(--fr-border);
  border-radius: 16px;
  background: var(--fr-surface);
  box-shadow: 0 8px 24px rgba(31, 38, 87, 0.08), inset 0 1px rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px) saturate(1.25);
  -webkit-backdrop-filter: blur(20px) saturate(1.25);
  padding: 18px 20px;
}
.friend-recall__card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--theme-primary);
}
.friend-recall__card-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fr-text);
}
.friend-recall__rule {
  margin: 12px 0 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  line-height: 1.8;
  color: var(--fr-text);
  overflow-wrap: anywhere;
}
.friend-recall__buffs {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.friend-recall__buff {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.5);
  padding: 12px 14px;
}
.friend-recall__buff-icon {
  color: var(--theme-primary);
  font-size: 18px;
}
.friend-recall__buff-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
}
.friend-recall__buff-code {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--fr-muted);
}

.friend-recall__notice {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid color-mix(in srgb, #d97706 35%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, #f59e0b 12%, transparent);
  color: #92400e;
  font-size: 13px;
  line-height: 1.6;
  padding: 12px 14px;
}

:global(.dark) .friend-recall {
  --fr-text: #edf2f9;
  --fr-muted: #bdcadb;
  --fr-border: rgba(203, 213, 225, 0.18);
  --fr-surface: linear-gradient(165deg, rgba(30, 41, 59, 0.8), rgba(30, 41, 59, 0.58));
}
:global(.dark) .friend-recall__hero {
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-primary) 24%, #1e293b), color-mix(in srgb, var(--theme-primary) 10%, #1e293b));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18), inset 0 1px rgba(255, 255, 255, 0.06);
}
:global(.dark) .friend-recall__rule,
:global(.dark) .friend-recall__buff {
  background: rgba(148, 163, 184, 0.1);
}
:global(.dark) .friend-recall__notice {
  color: #fcd34d;
}
</style>
