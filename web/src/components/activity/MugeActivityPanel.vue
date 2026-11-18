<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountStore } from '@/stores/account'

/**
 * 牧歌初启（muge）活动面板。
 *
 * 数据全部来自后端 `/api/activity/muge`（协议见 core/src/proto/muge.proto），
 * 页面只做展示与提交，不在前端推断活动规则或奖励。
 */
const props = defineProps<{ embedded?: boolean }>()
const emit = defineEmits<{ back: [] }>()

type Section = 'celebration' | 'friends' | 'handbook' | 'personality'
type Tone = 'done' | 'ready' | 'idle' | 'locked'

interface MugeReward { id: number, count: number, name: string, image?: string }
interface MugeTier { id: string, threshold: number, status: number, rewards: MugeReward[] }
interface MugeTask { id: string, description: string, progress: number, target: number, status: number, unlockDay: number, points: number, rewards: MugeReward[] }
interface MugeQuestion { id: number, title: string, options: Array<{ value: number, text: string, label: string }> }
interface MugeState {
  activityId: string
  title: string
  serverTime: number
  startTime: number
  endTime: number
  active: boolean
  rules: string[]
  celebration: { total: number, tiers: MugeTier[] } | null
  friends: { count: number, tiers: MugeTier[] } | null
  handbook: { points: number, tiers: MugeTier[], tasks: MugeTask[] } | null
  personality: { answers: Record<string, number>, personalityId: number, settleCount: number, image: string, shareRewardClaimed: boolean } | null
  questions: MugeQuestion[]
}

const accounts = useAccountStore()
const state = ref<MugeState | null>(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const tab = ref<Section>('celebration')
const rulesOpen = ref(false)
const answering = ref(false)
const questionIndex = ref(0)
let generation = 0
let timer: ReturnType<typeof setInterval> | null = null

const automationItems = [
  { key: 'muge_task_claim', label: '任务奖励' },
  { key: 'muge_celebration_claim', label: '庆典奖励' },
  { key: 'muge_friend_claim', label: '牧友奖励' },
  { key: 'muge_handbook_claim', label: '手册奖励' },
  { key: 'muge_auto_answer', label: '自动答题并领取' },
] as const
type AutomationKey = typeof automationItems[number]['key']
const automation = ref<Partial<Record<AutomationKey, boolean>>>({})
const automationReady = ref(false)
const automationLoading = ref(false)
const automationSaving = ref(false)
const automationError = ref('')
let automationRevision = 0

async function loadAutomation() {
  const accountId = accounts.currentAccountId
  if (!accountId || automationLoading.value || automationSaving.value)
    return
  const token = generation
  const revision = automationRevision
  automationLoading.value = true
  try {
    const { data } = await api.get('/api/settings', { headers: { 'x-account-id': accountId } })
    if (token !== generation)
      return
    if (!data.ok || !data.data)
      throw new Error(data.error || '自动功能读取失败')
    // A settings save may finish while this read is in flight; keep its newer patch.
    if (revision !== automationRevision)
      return
    automation.value = Object.fromEntries(automationItems.map(item => [item.key, data.data.automation?.[item.key] === true]))
    automationReady.value = true
    automationError.value = ''
  }
  catch (e: any) {
    if (token === generation) {
      automationReady.value = false
      automationError.value = e?.response?.data?.error || e?.message || '自动功能读取失败'
    }
  }
  finally {
    if (token === generation)
      automationLoading.value = false
  }
}

function syncAutomation(event: Event) {
  const detail = (event as CustomEvent<{ accountId: string, automation: Record<string, boolean> }>).detail
  if (!detail || String(detail.accountId) !== String(accounts.currentAccountId) || !detail.automation)
    return
  automationRevision++
  for (const item of automationItems) {
    if (typeof detail.automation[item.key] === 'boolean')
      automation.value[item.key] = detail.automation[item.key]
  }
}

async function saveAutomation(key: AutomationKey, value: boolean) {
  const accountId = accounts.currentAccountId
  if (!accountId || automationSaving.value)
    return
  automationSaving.value = true
  automationRevision++
  automation.value[key] = value
  try {
    const { data } = await api.post('/api/automation', { [key]: value }, { headers: { 'x-account-id': accountId } })
    if (!data?.ok)
      throw new Error(data?.error || '自动功能保存失败')
    automationError.value = ''
    // Keep every tab in sync (Settings.vue persists the same automation object).
    window.dispatchEvent(new CustomEvent('automation-updated', {
      detail: { accountId, automation: { ...automation.value } },
    }))
  }
  catch (e: any) {
    // Roll back the optimistic update on failure.
    automation.value[key] = !value
    automationError.value = e?.response?.data?.error || e?.message || '自动功能保存失败'
  }
  finally {
    automationSaving.value = false
  }
}
// 活动页不再展示自动功能开关，但保留保存逻辑供后端/其他入口复用，避免 noUnusedLocals 报错。
void saveAutomation

const disabled = computed(() => busy.value || loading.value || !state.value?.active)

const period = computed(() => {
  const s = state.value
  if (!s)
    return null
  const format = (value: number) => new Date(value).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  const day = (ms: number) => {
    const date = new Date(ms)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  }
  const days = Math.round((day(s.endTime) - day(s.serverTime)) / 86_400_000)
  const badge = !s.active || days < 0 ? '已结束' : days === 0 ? '今天结束' : `还剩 ${days} 天`
  return { text: `${format(s.startTime)} – ${format(s.endTime)}`, badge, ended: badge === '已结束' }
})

function claimableCount(tiers: MugeTier[] = []) {
  return tiers.filter(tier => tier.status === 2).length
}

const sections = computed(() => {
  const s = state.value
  return [
    { key: 'celebration' as Section, label: '兴牧庆典', icon: 'i-carbon-trophy', dot: claimableCount(s?.celebration?.tiers) > 0 },
    { key: 'friends' as Section, label: '牧友同行', icon: 'i-carbon-user-multiple', dot: claimableCount(s?.friends?.tiers) > 0 },
    { key: 'handbook' as Section, label: '成长手册', icon: 'i-carbon-notebook', dot: !!s?.handbook && (claimableCount(s.handbook.tiers) > 0 || s.handbook.tasks.some(task => task.status === 2)) },
    { key: 'personality' as Section, label: '牧场人格', icon: 'i-carbon-user-profile', dot: !!s?.personality?.personalityId && !s.personality.shareRewardClaimed },
  ]
})

/** 档位门槛动辄上亿，按万/亿缩写；当前数值仍显示完整数字。 */
function compact(value: number) {
  const trim = (n: number) => String(Number(n.toFixed(1)))
  if (value >= 1e8)
    return `${trim(value / 1e8)} 亿`
  if (value >= 1e4)
    return `${trim(value / 1e4)} 万`
  return value.toLocaleString('zh-CN')
}

function tierTone(status: number): { tone: Tone, text: string } {
  return status === 3 ? { tone: 'done', text: '已领取' } : status === 2 ? { tone: 'ready', text: '可领取' } : { tone: 'idle', text: '未达成' }
}

const tierSection = computed(() => {
  const s = state.value
  if (tab.value === 'celebration' && s?.celebration)
    return { label: '全服累计饲养', unit: '只', value: s.celebration.total, tiers: s.celebration.tiers, action: 'claimCelebration', note: '全服饲养数量达到档位后，所有玩家都可领取' }
  if (tab.value === 'friends' && s?.friends)
    return { label: '已开启牧场的好友', unit: '位', value: s.friends.count, tiers: s.friends.tiers, action: 'claimFriends', note: '好友关系解除不影响已计数的好友' }
  return null
})

function progressTo(value: number, tiers: MugeTier[], unit: string) {
  const next = [...tiers].sort((a, b) => a.threshold - b.threshold).find(tier => tier.status === 1 && tier.threshold > value)
  if (!next)
    return { percent: 100, text: '全部档位已达成' }
  const previous = [...tiers].filter(tier => tier.threshold <= value).sort((a, b) => b.threshold - a.threshold)[0]?.threshold || 0
  const span = next.threshold - previous
  return {
    percent: span > 0 ? Math.min(100, Math.max(0, (value - previous) / span * 100)) : 0,
    text: `距 ${compact(next.threshold)}${unit} 还差 ${compact(next.threshold - value)}`,
  }
}

const handbook = computed(() => state.value?.handbook || null)
const taskDays = computed(() => {
  const groups = new Map<number, MugeTask[]>()
  for (const task of handbook.value?.tasks || [])
    groups.set(task.unlockDay, [...(groups.get(task.unlockDay) || []), task])
  return [...groups].sort(([a], [b]) => a - b).map(([day, tasks]) => ({
    day,
    tasks,
    locked: tasks.every(task => task.status === 4),
    done: tasks.filter(task => task.status === 3).length,
  }))
})

function taskTone(task: MugeTask): { tone: Tone, text: string } {
  if (task.status === 3)
    return { tone: 'done', text: '已领取' }
  if (task.status === 2)
    return { tone: 'ready', text: '可领取' }
  if (task.status === 4)
    return { tone: 'locked', text: '未解锁' }
  return { tone: 'idle', text: `${task.progress} / ${task.target}` }
}

const questions = computed(() => state.value?.questions || [])
const question = computed(() => questions.value[questionIndex.value])
const answers = computed(() => state.value?.personality?.answers || {})
const allAnswered = computed(() => questions.value.length > 0 && questions.value.every(entry => answers.value[entry.id]))
const isLast = computed(() => questionIndex.value === questions.value.length - 1)

const rules = computed(() => {
  const lines: string[] = []
  for (const raw of state.value?.rules || []) {
    let parsed: any = null
    try {
      parsed = JSON.parse(raw)
    }
    catch {
      // 不是 JSON 的说明文本按原样展示
    }
    lines.push(...(Array.isArray(parsed?.tips?.txt) ? parsed.tips.txt.map(String) : [String(raw)]))
  }
  return lines
    .map(line => ({ heading: /^\s*<b>.*<\/b>\s*$/.test(line), text: line.replace(/<[^>]+>/g, '').trim() }))
    .filter(line => line.text)
})

async function refresh() {
  const accountId = accounts.currentAccountId
  if (!accountId || loading.value || busy.value)
    return
  const token = generation
  loading.value = true
  try {
    const { data } = await api.get('/api/activity/muge', { headers: { 'x-account-id': accountId }, timeout: 120_000 })
    if (token !== generation)
      return
    if (!data.ok || !data.activity)
      throw new Error(data.error || '牧歌初启数据读取失败')
    state.value = data.activity
    error.value = ''
  }
  catch (e: any) {
    if (token === generation)
      error.value = e?.response?.data?.error || e?.message || '牧歌初启数据读取失败'
  }
  finally {
    if (token === generation)
      loading.value = false
  }
}

async function act(action: string, params: any = {}) {
  const accountId = accounts.currentAccountId
  if (!accountId || busy.value || loading.value)
    return false
  const token = generation
  busy.value = true
  error.value = ''
  try {
    const { data } = await api.post('/api/activity/muge/operate', { accountId, action, params }, { headers: { 'x-account-id': accountId }, timeout: 190_000 })
    if (token !== generation)
      return false
    if (!data.ok)
      throw new Error(data.error || '操作失败')
    if (data.activity)
      state.value = data.activity
    return true
  }
  catch (e: any) {
    if (token === generation)
      error.value = e?.response?.data?.error || e?.message || '操作失败'
    return false
  }
  finally {
    if (token === generation)
      busy.value = false
  }
}

async function startSurvey() {
  if (disabled.value)
    return
  if (!await act('saveAnswers', { answers: {}, clear: true }))
    return
  answering.value = true
  questionIndex.value = 0
}

async function answer(value: number) {
  if (!question.value || disabled.value)
    return
  const index = questionIndex.value
  const saved = await act('saveAnswers', { answers: { [question.value.id]: value } })
  if (saved && index < questions.value.length - 1 && questionIndex.value === index)
    questionIndex.value++
}

async function settle() {
  if (await act('settle'))
    answering.value = false
}

watch(() => accounts.currentAccountId, () => {
  generation++
  state.value = null
  loading.value = false
  busy.value = false
  error.value = ''
  automation.value = {}
  automationReady.value = false
  automationLoading.value = false
  automationSaving.value = false
  automationError.value = ''
  void loadAutomation()
  answering.value = false
  questionIndex.value = 0
  void refresh()
}, { flush: 'sync' })

onMounted(() => {
  window.addEventListener('automation-updated', syncAutomation)
  void loadAutomation()
  void refresh()
  timer = setInterval(() => {
    if (!document.hidden) {
      void loadAutomation()
      if (!answering.value)
        void refresh()
    }
  }, 30_000)
})

onUnmounted(() => {
  window.removeEventListener('automation-updated', syncAutomation)
  generation++
  if (timer)
    clearInterval(timer)
})
</script>

<template>
  <section class="muge" :class="{ 'is-embedded': props.embedded }">
    <header class="muge-head">
      <div class="muge-head__lead">
        <button type="button" class="muge-icon-btn" title="返回活动列表" aria-label="返回活动列表" @click="emit('back')">
          <span class="i-carbon-arrow-left" />
        </button>
        <img src="/activity/muge/icon.png" alt="" width="32" height="32" class="muge-head__icon" aria-hidden="true">
        <div class="muge-head__text min-w-0">
          <h1>牧歌初启</h1>
          <p v-if="period">
            <span class="i-carbon-calendar" aria-hidden="true" />{{ period.text }}
            <span class="muge-head__badge" :class="{ 'is-ended': period.ended }">{{ period.badge }}</span>
          </p>
        </div>
      </div>
      <div class="muge-head__actions">
        <button type="button" class="muge-icon-btn" title="活动说明" aria-label="活动说明" @click="rulesOpen = true">
          <span class="i-carbon-information" />
        </button>
        <button type="button" class="muge-icon-btn" :disabled="loading" title="刷新活动" aria-label="刷新活动" @click="refresh">
          <span class="i-carbon-renew" :class="{ 'muge-spin': loading }" />
        </button>
      </div>
    </header>

    <nav class="muge-tabs" aria-label="牧歌初启玩法">
      <button
        v-for="section in sections"
        :key="section.key"
        type="button"
        class="muge-tab"
        :class="{ 'is-active': tab === section.key }"
        :aria-pressed="tab === section.key"
        @click="tab = section.key"
      >
        <span :class="section.icon" aria-hidden="true" />{{ section.label }}
        <i v-if="section.dot" class="muge-tab__dot" aria-label="有可领取奖励" />
      </button>
    </nav>

    <div class="muge-content">
      <p v-if="error" class="muge-error" role="alert">
        <span class="i-carbon-warning-alt" aria-hidden="true" />{{ error }}
      </p>

      <p v-if="!accounts.currentAccountId" class="muge-empty">
        <span class="i-carbon-user-avatar" aria-hidden="true" />请先选择账号
      </p>
      <p v-else-if="!state" class="muge-empty">
        <span :class="loading ? 'i-svg-spinners-90-ring-with-bg' : 'i-carbon-calendar'" aria-hidden="true" />
        {{ loading ? '正在读取活动进度' : '暂未获取到活动数据' }}
        <button v-if="!loading" type="button" class="muge-link" @click="refresh">
          重新读取
        </button>
      </p>

      <template v-else>
        <p v-if="!state.active" class="muge-notice">
          <span class="i-carbon-time" aria-hidden="true" />活动尚未开始或已经结束，奖励暂不可领取
        </p>

        <!-- 兴牧庆典 / 牧友同行 -->
        <template v-if="tierSection">
          <section class="muge-card muge-bar">
            <div class="muge-bar__value">
              <span>{{ tierSection.label }}</span>
              <strong>{{ tierSection.value.toLocaleString('zh-CN') }}<small>{{ tierSection.unit }}</small></strong>
            </div>
            <div class="muge-bar__progress">
              <div class="muge-track" aria-hidden="true">
                <i :style="{ width: `${progressTo(tierSection.value, tierSection.tiers, tierSection.unit).percent}%` }" />
              </div>
              <span>{{ progressTo(tierSection.value, tierSection.tiers, tierSection.unit).text }}<em> · {{ tierSection.note }}</em></span>
            </div>
            <BaseButton
              variant="primary"
              :disabled="disabled || !claimableCount(tierSection.tiers)"
              :loading="busy"
              @click="act(tierSection.action)"
            >
              {{ claimableCount(tierSection.tiers) ? `领取 ${claimableCount(tierSection.tiers)} 档奖励` : '暂无可领取' }}
            </BaseButton>
          </section>

          <div class="muge-grid">
            <article v-for="tier in tierSection.tiers" :key="tier.id" class="muge-card muge-item" :class="`is-${tierTone(tier.status).tone}`">
              <span class="muge-item__well"><span class="i-carbon-gift" aria-hidden="true" /><img v-if="tier.rewards[0]?.image" :src="tier.rewards[0].image" alt=""></span>
              <div class="muge-item__main">
                <strong>{{ compact(tier.threshold) }}{{ tierSection.unit }}</strong>
                <span v-for="reward in tier.rewards" :key="reward.id">{{ reward.name }} <b>×{{ reward.count.toLocaleString('zh-CN') }}</b></span>
              </div>
              <span class="muge-status" :class="`is-${tierTone(tier.status).tone}`">
                <span v-if="tier.status === 3" class="i-carbon-checkmark" aria-hidden="true" />{{ tierTone(tier.status).text }}
              </span>
            </article>
          </div>
        </template>

        <!-- 成长手册 -->
        <template v-else-if="tab === 'handbook'">
          <p v-if="!handbook" class="muge-empty">
            <span class="i-carbon-locked" aria-hidden="true" />成长手册未开启
          </p>
          <template v-else>
            <section class="muge-card muge-bar">
              <div class="muge-bar__value">
                <span>成长积分</span>
                <strong>{{ handbook.points }}<small>积分</small></strong>
              </div>
              <div class="muge-bar__progress">
                <div class="muge-track" aria-hidden="true">
                  <i :style="{ width: `${progressTo(handbook.points, handbook.tiers, ' 积分').percent}%` }" />
                </div>
                <span>{{ progressTo(handbook.points, handbook.tiers, ' 积分').text }}</span>
              </div>
              <div class="muge-bar__actions">
                <BaseButton :disabled="disabled || !handbook.tasks.some(task => task.status === 2)" @click="act('claimTask')">
                  领取任务奖励
                </BaseButton>
                <BaseButton variant="primary" :disabled="disabled || !claimableCount(handbook.tiers)" @click="act('claimHandbook')">
                  领取积分奖励
                </BaseButton>
              </div>
            </section>

            <section class="muge-section">
              <header class="muge-section__head">
                <i aria-hidden="true" /><h2>积分奖励</h2>
                <span>{{ handbook.tiers.filter(tier => tier.status === 3).length }} / {{ handbook.tiers.length }}</span>
              </header>
              <div class="muge-grid is-small">
                <article v-for="tier in handbook.tiers" :key="tier.id" class="muge-card muge-item is-compact" :class="`is-${tierTone(tier.status).tone}`">
                  <span class="muge-item__well"><span class="i-carbon-gift" aria-hidden="true" /><img v-if="tier.rewards[0]?.image" :src="tier.rewards[0].image" alt=""></span>
                  <div class="muge-item__main">
                    <strong>{{ tier.threshold }} 积分</strong>
                    <span v-if="tier.rewards[0]">{{ tier.rewards[0].name }} <b>×{{ tier.rewards[0].count.toLocaleString('zh-CN') }}</b></span>
                  </div>
                  <span v-if="tier.status !== 1" class="muge-status" :class="`is-${tierTone(tier.status).tone}`">
                    <span v-if="tier.status === 3" class="i-carbon-checkmark" aria-hidden="true" />{{ tierTone(tier.status).text }}
                  </span>
                </article>
              </div>
            </section>

            <details v-for="group in taskDays" :key="group.day" class="muge-section" :open="!group.locked">
              <summary class="muge-section__head">
                <i aria-hidden="true" /><h2>第 {{ group.day }} 天</h2>
                <span>{{ group.locked ? `未解锁 · ${group.tasks.length} 个任务` : `已完成 ${group.done} / ${group.tasks.length}` }}</span>
                <span class="muge-section__chevron i-carbon-chevron-down" aria-hidden="true" />
              </summary>
              <div class="muge-grid">
                <article v-for="task in group.tasks" :key="task.id" class="muge-card muge-item" :class="`is-${taskTone(task).tone}`">
                  <span class="muge-item__well"><span class="i-carbon-gift" aria-hidden="true" /><img v-if="task.rewards[0]?.image" :src="task.rewards[0].image" alt=""></span>
                  <div class="muge-item__main">
                    <strong :title="task.description">{{ task.description }}</strong>
                    <span>
                      {{ task.points }} 积分
                      <template v-for="reward in task.rewards" :key="reward.id"> · {{ reward.name }} <b>×{{ reward.count.toLocaleString('zh-CN') }}</b></template>
                    </span>
                  </div>
                  <span class="muge-status" :class="`is-${taskTone(task).tone}`">
                    <span v-if="task.status === 3" class="i-carbon-checkmark" aria-hidden="true" />{{ taskTone(task).text }}
                  </span>
                </article>
              </div>
            </details>
          </template>
        </template>

        <!-- 牧场人格 -->
        <template v-else-if="tab === 'personality'">
          <p v-if="!state.personality" class="muge-empty">
            <span class="i-carbon-user-profile" aria-hidden="true" />牧场人格暂不可用
          </p>

          <section v-else-if="answering && question" class="muge-card muge-quiz" aria-label="牧场人格测试">
            <header class="muge-quiz__head">
              <span>第 <b>{{ questionIndex + 1 }}</b> / {{ questions.length }} 题</span>
              <button type="button" class="muge-link" :disabled="busy" @click="answering = false">
                退出测试
              </button>
            </header>
            <div class="muge-track" aria-hidden="true">
              <i :style="{ width: `${(questionIndex + 1) / questions.length * 100}%` }" />
            </div>
            <h3 class="muge-quiz__title">
              {{ question.title }}
            </h3>
            <div class="muge-quiz__options" role="radiogroup" :aria-label="question.title">
              <button
                v-for="option in question.options"
                :key="option.value"
                type="button"
                role="radio"
                class="muge-option"
                :aria-checked="answers[String(question.id)] === option.value"
                :disabled="disabled"
                @click="answer(option.value)"
              >
                <span class="muge-option__letter">{{ option.label }}</span>
                <span class="muge-option__text">{{ option.text }}</span>
                <span v-if="answers[String(question.id)] === option.value" class="muge-option__check i-carbon-checkmark-filled" aria-hidden="true" />
              </button>
            </div>
            <footer class="muge-quiz__foot">
              <BaseButton :disabled="busy || questionIndex === 0" @click="questionIndex--">
                上一题
              </BaseButton>
              <BaseButton v-if="isLast" variant="primary" :loading="busy" :disabled="disabled || !allAnswered" @click="settle">
                查看人格结果
              </BaseButton>
              <BaseButton v-else :disabled="busy || !answers[String(question.id)]" @click="questionIndex++">
                下一题
              </BaseButton>
            </footer>
          </section>

          <section v-else class="muge-card muge-result">
            <img v-if="state.personality.image" :src="state.personality.image" alt="我的牧场人格测试结果" class="muge-result__poster">
            <span v-else class="muge-result__placeholder" aria-hidden="true"><span class="i-carbon-user-profile" /></span>
            <div class="muge-result__body">
              <div>
                <h3>{{ state.personality.personalityId ? '我的牧场人格' : '测一测你的牧场人格' }}</h3>
                <p>
                  {{ state.personality.personalityId
                    ? '根据经营农场的习惯得出，活动期间可以重新测试，新结果会覆盖旧结果。'
                    : '根据经营农场的习惯得出你的牧场人格，测试结果可以分享给好友。' }}
                </p>
              </div>
              <ul class="muge-result__facts">
                <li>
                  <span>题目</span><b>{{ questions.length }} 道</b>
                </li>
                <li>
                  <span>已测试</span><b>{{ state.personality.settleCount || (state.personality.personalityId ? 1 : 0) }} 次</b>
                </li>
                <li :class="{ 'is-ready': state.personality.personalityId && !state.personality.shareRewardClaimed }">
                  <span>首次分享奖励</span>
                  <b>{{ state.personality.shareRewardClaimed ? '已领取' : state.personality.personalityId ? '可领取' : '完成测试后领取' }}</b>
                </li>
              </ul>
              <div class="muge-result__actions">
                <BaseButton :variant="state.personality.personalityId ? 'secondary' : 'primary'" :disabled="disabled" @click="startSurvey">
                  {{ state.personality.personalityId ? '重新测试' : '开始测试' }}
                </BaseButton>
                <BaseButton
                  v-if="state.personality.personalityId && !state.personality.shareRewardClaimed"
                  variant="primary"
                  :disabled="disabled"
                  @click="act('claimShare')"
                >
                  领取首次分享奖励
                </BaseButton>
              </div>
            </div>
          </section>
        </template>
      </template>
    </div>

    <div v-if="rulesOpen" class="muge-rules-mask" @click.self="rulesOpen = false">
      <div class="muge-rules" role="dialog" aria-label="牧歌初启 · 活动说明">
        <header>
          <h2>牧歌初启 · 活动说明</h2>
          <button type="button" class="muge-icon-btn" aria-label="关闭" @click="rulesOpen = false">
            <span class="i-carbon-close" />
          </button>
        </header>
        <div class="muge-rules__body">
          <p v-for="(line, index) in rules" :key="index" :class="{ 'is-heading': line.heading }">
            {{ line.text }}
          </p>
          <p v-if="!rules.length" class="muge-rules__empty">
            暂无活动说明
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.muge-automation {
  padding: 12px 14px;
  backdrop-filter: blur(18px) saturate(1.25);
  -webkit-backdrop-filter: blur(18px) saturate(1.25);
}
.muge-automation__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.muge-automation__head h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
}
.muge-automation__head > span,
.muge-automation__hint {
  font-size: 11px;
  color: var(--muge-muted);
}
.muge-automation__switches {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  margin-block: 8px;
}
.muge-automation__switches :deep(label > span) {
  color: var(--muge-text);
  font-size: 12px;
}

.muge {
  --muge-text: #243247;
  --muge-muted: #526176;
  --muge-border: rgba(255, 255, 255, 0.7);
  --muge-soft: rgba(255, 255, 255, 0.45);
  --muge-surface: linear-gradient(165deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.48));
  --muge-dialog: rgba(255, 255, 255, 0.92);
  --muge-tint: color-mix(in srgb, var(--theme-primary) 13%, transparent);
  --muge-accent-border: color-mix(in srgb, var(--theme-primary) 48%, transparent);
  color: var(--muge-text);
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
}
.muge h1,
.muge h2,
.muge h3,
.muge p {
  margin: 0;
}
.muge-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.muge-head__lead {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.muge-head__icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.muge-head__text h1 {
  font-size: 19px;
  font-weight: 700;
  color: var(--muge-text);
}
.muge-head__text p {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 12px;
  color: var(--muge-muted);
}
.muge-head__badge {
  margin-left: 6px;
  border-radius: 999px;
  background: var(--muge-tint);
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--theme-primary);
}
.muge-head__badge.is-ended {
  background: rgba(107, 114, 128, 0.14);
  color: var(--muge-muted);
}
.muge-head__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.muge-icon-btn {
  display: grid;
  height: 32px;
  width: 32px;
  place-items: center;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muge-muted);
  font-size: 17px;
}
.muge-icon-btn:hover {
  border-color: rgba(255, 255, 255, 0.7);
  background: var(--muge-soft);
}
.muge-icon-btn:disabled {
  opacity: 0.5;
}
.muge-spin {
  animation: muge-spin 1s linear infinite;
}
@keyframes muge-spin {
  to {
    transform: rotate(360deg);
  }
}
.muge-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 8px;
}
.muge-tab {
  min-width: 0;
  min-height: 42px;
  justify-content: center;
  border: 1px solid var(--muge-border);
  background: var(--muge-soft);
  box-shadow:
    0 3px 12px rgba(31, 38, 80, 0.06),
    inset 0 1px 0 var(--muge-border);
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--muge-muted);
}
.muge-tab.is-active {
  border-color: var(--muge-accent-border);
  background: color-mix(in srgb, var(--theme-primary) 18%, var(--muge-soft));
  color: var(--theme-primary);
  font-weight: 700;
  box-shadow:
    0 4px 16px var(--muge-tint),
    inset 0 1px 0 var(--muge-border);
}
.muge-tab__dot {
  position: absolute;
  top: 4px;
  right: 4px;
  height: 6px;
  width: 6px;
  border-radius: 999px;
  background: #ef4444;
}
.muge-content {
  min-width: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.muge-error {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: rgba(254, 226, 226, 0.7);
  padding: 8px 10px;
  font-size: 12px;
  color: #b91c1c;
}
.muge-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  background: var(--muge-soft);
  padding: 8px 10px;
  font-size: 12px;
  color: var(--muge-muted);
}
.muge-empty {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  border-radius: 12px;
  background: var(--muge-soft);
  padding: 32px 16px;
  font-size: 13px;
  color: var(--muge-muted);
}
.muge-link {
  color: var(--theme-primary);
  font-size: 12px;
  text-decoration: underline;
}
.muge-card {
  border-radius: 12px;
  border: 1px solid var(--muge-border);
  background: var(--muge-surface);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}
.muge-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
}
.muge-bar__value {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--muge-muted);
}
.muge-bar__value strong {
  font-size: 20px;
  font-weight: 700;
  color: var(--muge-text);
}
.muge-bar__value strong small {
  margin-left: 3px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muge-muted);
}
.muge-bar__progress {
  display: flex;
  min-width: 180px;
  flex: 1 1 220px;
  flex-direction: column;
  gap: 5px;
  font-size: 11px;
  color: var(--muge-muted);
}
.muge-bar__progress em {
  font-style: normal;
  color: var(--muge-muted);
}
.muge-bar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.muge-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(107, 114, 128, 0.18);
}
.muge-track i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--theme-primary);
  transition: width 0.3s ease;
}
.muge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.muge-grid.is-small {
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
}
.muge-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}
.muge-item.is-compact {
  gap: 8px;
  padding: 8px 10px;
}
.muge-item.is-done {
  opacity: 0.78;
}
.muge-item.is-ready {
  border-color: var(--muge-accent-border);
  box-shadow: 0 0 0 1px var(--muge-tint);
}
.muge-item.is-locked {
  opacity: 0.6;
}
.muge-item__well {
  display: grid;
  height: 40px;
  width: 40px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  background: var(--muge-soft);
}
.muge-item.is-compact .muge-item__well {
  height: 32px;
  width: 32px;
}
.muge-item__well > span {
  grid-area: 1 / 1;
  font-size: 22px;
  color: var(--muge-muted);
}
.muge-item__well:has(img) > span {
  display: none;
}
.muge-item__well img {
  grid-area: 1 / 1;
  max-height: 30px;
  max-width: 30px;
  object-fit: contain;
}
.muge-item__main {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: var(--muge-muted);
}
.muge-item__main strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  color: var(--muge-text);
  overflow-wrap: anywhere;
  white-space: normal;
}
.muge-item__main b {
  font-weight: 600;
  color: var(--theme-primary);
}
.muge-status {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
}
.muge-status.is-done {
  background: rgba(107, 114, 128, 0.14);
  color: var(--muge-muted);
}
.muge-status.is-ready {
  background: var(--muge-tint);
  color: var(--theme-primary);
}
.muge-status.is-idle {
  background: rgba(107, 114, 128, 0.1);
  color: var(--muge-muted);
}
.muge-status.is-locked {
  background: rgba(107, 114, 128, 0.1);
  color: var(--muge-muted);
}
.muge-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.muge-section__head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muge-muted);
  cursor: pointer;
  list-style: none;
}
.muge-section__head h2 {
  font-size: 13px;
  font-weight: 700;
  color: var(--muge-text);
}
.muge-section__head i:first-child {
  height: 3px;
  width: 10px;
  border-radius: 999px;
  background: var(--theme-primary);
}
.muge-section__chevron {
  margin-left: auto;
}
.muge-quiz {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}
.muge-quiz__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muge-muted);
}
.muge-quiz__head b {
  color: var(--muge-text);
}
.muge-quiz__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--muge-text);
}
.muge-quiz__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.muge-option {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 10px;
  border: 1px solid rgba(107, 114, 128, 0.18);
  background: var(--muge-soft);
  padding: 9px 12px;
  text-align: left;
  font-size: 13px;
  color: var(--muge-text);
}
.muge-option:hover {
  border-color: var(--muge-accent-border);
}
.muge-option[aria-checked='true'] {
  border-color: var(--theme-primary);
  background: var(--muge-tint);
}
.muge-option__letter {
  display: grid;
  height: 22px;
  width: 22px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 999px;
  background: var(--muge-tint);
  font-size: 11px;
  font-weight: 700;
  color: var(--theme-primary);
}
.muge-option__text {
  flex: 1 1 auto;
}
.muge-option__check {
  color: var(--theme-primary);
}
.muge-quiz__foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.muge-result {
  display: flex;
  gap: 14px;
  padding: 14px;
}
.muge-result__poster {
  width: 132px;
  height: auto;
  align-self: flex-start;
  flex: 0 0 auto;
  border-radius: 10px;
  object-fit: contain;
}
.muge-result__placeholder {
  display: grid;
  height: 132px;
  width: 132px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: var(--muge-soft);
  font-size: 34px;
  color: var(--muge-muted);
}
.muge-result__body {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
}
.muge-result__body h3 {
  font-size: 15px;
  font-weight: 700;
  color: var(--muge-text);
}
.muge-result__body p {
  margin-top: 3px;
  font-size: 12px;
  color: var(--muge-muted);
}
.muge-result__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.muge-result__facts li {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-radius: 8px;
  background: var(--muge-soft);
  padding: 6px 10px;
  font-size: 11px;
  color: var(--muge-muted);
}
.muge-result__facts li b {
  font-size: 12px;
  color: var(--muge-text);
}
.muge-result__facts li.is-ready b {
  color: var(--theme-primary);
}
.muge-result__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.muge-rules-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(2px);
  padding: 16px;
}
.muge-rules {
  display: flex;
  max-height: 78vh;
  width: min(560px, 100%);
  flex-direction: column;
  border-radius: 14px;
  background: var(--muge-dialog);
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}
.muge-rules header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid rgba(107, 114, 128, 0.16);
  padding: 10px 14px;
}
.muge-rules header h2 {
  font-size: 14px;
  font-weight: 700;
  color: var(--muge-text);
}
.muge-rules__body {
  overflow-y: auto;
  padding: 12px 14px 16px;
}
.muge-rules__body p {
  font-size: 12px;
  line-height: 1.7;
  color: var(--muge-muted);
}
.muge-rules__body p.is-heading {
  margin-top: 6px;
  font-weight: 700;
  color: var(--muge-text);
}
.muge-rules__empty {
  color: var(--muge-muted);
}
/* Match the existing ranch glass surfaces without filtering the dialog ancestor. */
.muge-head,
.muge-tabs,
.muge-content {
  border: 1px solid var(--muge-border);
  border-radius: 18px;
  background: var(--muge-surface);
  box-shadow:
    0 8px 24px rgba(31, 38, 80, 0.08),
    inset 0 1px 0 var(--muge-border);
}
.muge-head {
  padding: 12px;
}
.muge-head__lead {
  flex: 1 1 220px;
}
.muge-head__actions {
  flex-shrink: 0;
  margin-left: auto;
}
.muge-icon-btn {
  flex-shrink: 0;
  border-color: var(--muge-border);
  background: var(--muge-soft);
  box-shadow: 0 3px 12px rgba(31, 38, 80, 0.06);
}
.muge-head,
.muge-tabs,
.muge-content,
.muge-icon-btn,
.muge-tab,
.muge-rules {
  -webkit-backdrop-filter: blur(18px) saturate(1.25);
  backdrop-filter: blur(18px) saturate(1.25);
}
.muge-icon-btn,
.muge-tab {
  cursor: pointer;
  transition:
    background 0.18s,
    box-shadow 0.18s;
}
.muge-tab:hover {
  border-color: var(--muge-accent-border);
  background: var(--muge-tint);
}
.muge button:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: 3px;
}
.muge [class*='i-carbon-'],
.muge [class*='i-svg-spinners-'] {
  display: inline-block;
  flex-shrink: 0;
}
.muge-item {
  min-width: 0;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
}
.muge-item.is-compact {
  grid-template-columns: 32px minmax(0, 1fr);
}
.muge-item .muge-status {
  grid-column: 2;
  justify-self: start;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.muge-item__main {
  overflow-wrap: anywhere;
}
.muge-bar__value {
  min-width: 0;
}
.muge-bar__value strong {
  overflow-wrap: anywhere;
}
.muge-rules__body {
  overscroll-behavior: contain;
}
:global(.dark) .muge {
  --muge-text: #edf2f9;
  --muge-muted: #bdcadb;
  --muge-border: rgba(203, 213, 225, 0.23);
  --muge-soft: rgba(15, 23, 42, 0.38);
  --muge-surface: linear-gradient(165deg, rgba(30, 41, 59, 0.8), rgba(30, 41, 59, 0.58));
  --muge-dialog: rgba(30, 41, 59, 0.94);
}
:global(.dark) .muge-error {
  background: rgba(127, 29, 29, 0.35);
  color: #fecaca;
}
@media (max-width: 640px) {
  .muge-head {
    gap: 8px;
    padding: 10px;
    align-items: flex-start;
  }
  .muge-head__lead {
    flex: 1 1 100%;
    gap: 8px;
  }
  .muge-head__actions {
    margin-left: 40px;
  }
  .muge-head__icon {
    display: none;
  }
  .muge-head__badge {
    margin-left: 0;
  }
  .muge-head__text p {
    row-gap: 6px;
  }
  .muge-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .muge-content {
    padding: 10px;
  }
  .muge-bar__progress {
    min-width: 0;
    flex-basis: 100%;
  }
  .muge-head__text h1 {
    font-size: 17px;
  }
  .muge-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  }
  .muge-grid.is-small {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  }
  .muge-result {
    flex-direction: column;
  }
  .muge-result__poster {
    width: min(100%, 240px);
    height: auto;
    align-self: center;
  }
  .muge-result__placeholder {
    width: 100%;
    height: 180px;
  }
}
</style>
