<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useAccountStore } from '@/stores/account'
import { useRanchStore } from '@/stores/ranch'
import { useToastStore } from '@/stores/toast'

const accountStore = useAccountStore()
const ranchStore = useRanchStore()
const toast = useToastStore()

const { currentAccountId } = storeToRefs(accountStore)
const { ranches, opTimes, loading, acting, error } = storeToRefs(ranchStore)

const accountId = computed(() => String(currentAccountId.value || ''))
const headers = computed(() => ({ 'x-account-id': accountId.value }))

// 客态查看（0 = 主态）
const hostGid = ref(0)
// 牧草机加料
const addFeedCount = ref(100)
// 投喂罐头桶（单只）
const feedCount = ref(1)
// 幼崽入栏
const placeRanchInstId = ref(0)
const placeAnimalId = ref(0)
const placeGiantCubItemId = ref(0)

// 牧场自动化开关（真实存在于 store，POST /api/automation 单键写入）
const autoHarvest = ref(false)
const autoFeed = ref(false)
const autoAddFeed = ref(false)
const ranchInterval = ref(30)
const autoReady = ref(false)

// 展平所有栏舍的动物，卡片网格用
interface AnimalRow {
  ranch: any
  animal: any
}
const animalRows = computed<AnimalRow[]>(() => {
  const rows: AnimalRow[] = []
  for (const ranch of ranches.value || []) {
    for (const animal of ranch.animals || []) rows.push({ ranch, animal })
  }
  return rows
})

const stats = computed(() => {
  const rows = animalRows.value
  const capacity = (ranches.value || []).reduce((sum, r) => sum + (Number(r.capacity) || 0), 0)
  return {
    pens: (ranches.value || []).length,
    capacity,
    animals: rows.length,
    canHarvest: rows.filter(({ animal }) => Number(animal.can_harvest) > 0).length,
    needFeed: rows.filter(({ animal }) => Number(animal.can_feed) > 0).length,
  }
})

function load() {
  if (!accountId.value) return
  ranchStore.fetchDetail(accountId.value, Number(hostGid.value) || 0)
  ranchStore.fetchOpTimes(accountId.value)
  loadAutomation()
}

async function loadAutomation() {
  autoReady.value = false
  try {
    const { data } = await api.get('/api/settings', { headers: headers.value })
    const d = data?.data || {}
    autoHarvest.value = !!d.automation?.ranch_harvest
    autoFeed.value = !!d.automation?.ranch_feed
    autoAddFeed.value = !!d.automation?.ranch_add_feed
    ranchInterval.value = Number(d.ranchCheckIntervalMinutes) || 30
  }
  catch {
    // 设置读取失败不阻塞牧场页展示
  }
  await nextTick()
  autoReady.value = true
}

async function saveAutoOne(key: string, value: boolean) {
  if (!autoReady.value || !accountId.value) return
  try {
    await api.post('/api/automation', { [key]: value }, { headers: headers.value })
  }
  catch (err: any) {
    toast.error(err?.message || '自动开关保存失败')
  }
}

watch(autoHarvest, v => saveAutoOne('ranch_harvest', v))
watch(autoFeed, v => saveAutoOne('ranch_feed', v))
watch(autoAddFeed, v => saveAutoOne('ranch_add_feed', v))

onMounted(load)
watch(accountId, () => load())

async function run(action: string, payload: Record<string, any>, successMsg: string) {
  if (!accountId.value) {
    toast.warning('请先选择账号')
    return
  }
  const res = await ranchStore.act(accountId.value, action, payload)
  if (res?.ok) {
    toast.success(successMsg)
    load()
  }
  else {
    toast.error(res?.error || '操作失败')
  }
}

function doHarvest() { run('harvest', { mode: 1 }, '一键收获成功') }
function doTriggerAll() { run('triggerProduce', {}, '开始生产成功') }
function doTriggerSlot(r: any, a: any) {
  run('triggerProduce', { ranch_inst_id: r.ranch_inst_id, slot_index: a.slot_index }, '开始生产成功')
}
function doCleanAll() { run('cleanAll', { host_gid: Number(hostGid.value) || 0 }, '一键清理成功') }
function doStroke(r: any, a: any) {
  run('stroke', {
    host_gid: Number(hostGid.value) || 0,
    ranch_inst_id: r.ranch_inst_id,
    slot_index: a.slot_index,
  }, '撸动物成功')
}
function doFeedOne(r: any, a: any) {
  run('feed', {
    ranch_inst_id: r.ranch_inst_id,
    animal_inst_id: a.animal_inst_id,
    count: Number(feedCount.value) || 1,
  }, '投喂成功')
}
function doPlace() {
  run('placeAnimal', {
    ranch_inst_id: Number(placeRanchInstId.value),
    animal_id: Number(placeAnimalId.value),
    giant_cub_item_id: Number(placeGiantCubItemId.value),
  }, '幼崽入栏成功')
}
function doAddFeed() {
  run('addFeed', {
    instance_id: 10002,
    add_count: Number(addFeedCount.value),
    use_gold: 0,
    host_gid: Number(hostGid.value) || 0,
  }, '加牧草成功')
}

function fmtTime(ms: number | string | undefined) {
  if (!ms || Number(ms) <= 0) return '-'
  const d = new Date(Number(ms))
  return Number.isNaN(d.getTime()) ? String(ms) : d.toLocaleString('zh-CN', { hour12: false })
}

function statusLabel(a: any) {
  if (Number(a.can_harvest) > 0) return '可收获'
  if (Number(a.producing) > 0) return '生产中'
  if (Number(a.grass_blocked) > 0) return '缺草'
  if (Number(a.stage) === 1) return '幼崽'
  return '生长中'
}

function statusTone(a: any) {
  if (Number(a.can_harvest) > 0) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  if (Number(a.producing) > 0) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  if (Number(a.grass_blocked) > 0) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
  return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
}

// stage 1~5 做一条简单生长进度
function stagePercent(a: any) {
  const s = Math.max(0, Math.min(5, Number(a.stage) || 0))
  return `${(s / 5) * 100}%`
}

function opText(o: any) {
  return `${Number(o.count) || 0} / ${Number(o.limit) || 0}`
}

// 动物头像走项目内置素材（后端在 HTTP 边界补 animal_image），加载失败就回退到图标
const brokenImages = ref<Set<string>>(new Set())
function animalImage(a: any) {
  const src = String(a?.animal_image || '')
  if (!src || brokenImages.value.has(src)) return ''
  return src
}
function onImageError(src: string) {
  if (!src) return
  const next = new Set(brokenImages.value)
  next.add(src)
  brokenImages.value = next
}
</script>

<template>
  <div class="space-y-4 p-4">
    <!-- 顶部：绿色渐变主卡（晨光牧场） -->
    <section class="relative overflow-hidden rounded-2xl border border-green-100 bg-gradient-to-br from-emerald-50 via-green-50 to-white p-5 shadow-sm dark:border-green-900/40 dark:from-emerald-950/40 dark:via-green-950/30 dark:to-gray-900/60">
      <div class="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-green-200/30 blur-2xl dark:bg-green-700/20" />
      <div class="relative flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="mb-1 flex items-center gap-2 text-xs text-green-700/80 font-medium tracking-widest dark:text-green-300/80">
            <span class="i-carbon-cattle text-base" />
            <span>牧场 · RANCH</span>
          </div>
          <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">晨光牧场</h1>
          <p class="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            让每一只小动物都吃饱、长大、产出。窝位、生产与收获都集中在这里。
          </p>

          <!-- 统计块：全部来自真实详情数据 -->
          <div class="mt-4 flex flex-wrap gap-2">
            <div class="min-w-20 rounded-xl bg-white/70 px-3 py-2 shadow-sm dark:bg-gray-800/60">
              <div class="text-xs text-gray-400">栏舍</div>
              <div class="text-lg text-gray-800 font-semibold dark:text-gray-100">{{ stats.pens }}</div>
            </div>
            <div class="min-w-20 rounded-xl bg-white/70 px-3 py-2 shadow-sm dark:bg-gray-800/60">
              <div class="text-xs text-gray-400">窝位</div>
              <div class="text-lg text-gray-800 font-semibold dark:text-gray-100">{{ stats.animals }}/{{ stats.capacity }}</div>
            </div>
            <div class="min-w-20 rounded-xl bg-white/70 px-3 py-2 shadow-sm dark:bg-gray-800/60">
              <div class="text-xs text-gray-400">可收获</div>
              <div class="text-lg text-gray-800 font-semibold dark:text-gray-100">{{ stats.canHarvest }}</div>
            </div>
            <div class="min-w-20 rounded-xl bg-white/70 px-3 py-2 shadow-sm dark:bg-gray-800/60">
              <div class="text-xs text-gray-400">待喂食</div>
              <div class="text-lg text-gray-800 font-semibold dark:text-gray-100">{{ stats.needFeed }}</div>
            </div>
          </div>
        </div>

        <!-- 右侧操作：全部对应真实抓包协议 -->
        <div class="flex flex-wrap items-center gap-2">
          <BaseButton size="sm" variant="primary" :loading="acting" @click="doHarvest">
            <span class="i-carbon-wheat mr-1" />一键收获
          </BaseButton>
          <BaseButton size="sm" variant="secondary" :loading="acting" @click="doTriggerAll">
            <span class="i-carbon-circle-dash mr-1" />一键生产
          </BaseButton>
          <BaseButton size="sm" variant="secondary" :loading="acting" @click="doCleanAll">
            <span class="i-carbon-clean mr-1" />一键清理
          </BaseButton>
          <BaseButton size="sm" variant="secondary" :loading="loading" @click="load">刷新</BaseButton>
        </div>
      </div>
    </section>

    <!-- 自动牧场开关行 -->
    <section class="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-gray-200 bg-white/70 px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800/50">
      <div class="flex items-center gap-2 text-sm text-gray-700 font-semibold dark:text-gray-200">
        <span class="i-carbon-magic-wand text-base text-green-600 dark:text-green-400" />
        自动牧场
      </div>
      <BaseSwitch v-model="autoHarvest" label="自动收获" />
      <BaseSwitch v-model="autoFeed" label="自动喂食" />
      <BaseSwitch v-model="autoAddFeed" label="牧草机加料" />
      <div class="ml-auto rounded-full bg-green-50 px-3 py-1 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
        检测间隔 {{ ranchInterval }} 分钟
      </div>
    </section>

    <div v-if="error" class="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{{ error }}</div>

    <!-- 窝位：动物卡片网格（居中展示） -->
    <section class="mx-auto w-full max-w-5xl">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base text-gray-800 font-semibold dark:text-gray-100">窝位</h2>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">{{ stats.animals }} 只在栏 · {{ Math.max(0, stats.capacity - stats.animals) }} 个空位</span>
          <BaseInput v-model.number="hostGid" label="客态 host_gid" type="number" min="0" />
          <BaseButton size="sm" variant="ghost" :loading="loading" @click="load">切换查看</BaseButton>
        </div>
      </div>

      <div v-if="!animalRows.length" class="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 dark:border-gray-700">
        还没有饲养动物，或该账号暂无牧场数据。选择账号后点「刷新」试试。
      </div>

      <div v-else class="flex flex-wrap justify-center gap-3">
        <article
          v-for="({ ranch, animal }) in animalRows"
          :key="`${animal.ranch_inst_id}-${animal.slot_index}-${animal.animal_inst_id}`"
          class="w-[260px] max-w-full rounded-2xl border border-gray-100 bg-white p-3 shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800/60"
        >
          <header class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <div class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-green-50 dark:bg-green-900/30">
                  <img
                    v-if="animalImage(animal)"
                    :src="animalImage(animal)"
                    :alt="animal.animal_name || ''"
                    class="h-9 w-9 object-contain"
                    loading="lazy"
                    @error="onImageError(animalImage(animal))"
                  >
                  <span v-else class="i-carbon-cattle text-lg text-green-600 dark:text-green-300" />
                </div>
                <div class="min-w-0">
                  <div class="truncate text-sm text-gray-800 font-semibold dark:text-gray-100">{{ animal.animal_name || `动物 #${animal.animal_id}` }}</div>
                  <div class="truncate text-xs text-gray-400">窝位 #{{ animal.slot_index }} · 栏舍 #{{ ranch.ranch_inst_id }}</div>
                </div>
              </div>
            </div>
            <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" :class="statusTone(animal)">{{ statusLabel(animal) }}</span>
          </header>

          <!-- 生长进度 -->
          <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div class="h-full rounded-full bg-green-400 dark:bg-green-500" :style="{ width: stagePercent(animal) }" />
          </div>

          <div class="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span>阶段 <b class="text-gray-700 dark:text-gray-200">{{ animal.stage }}</b></span>
            <span>产物 <b class="text-gray-700 dark:text-gray-200">{{ animal.produce_count }}</b></span>
            <span class="col-span-2 truncate">成长 {{ fmtTime(animal.grow_ready_at_ms) }}</span>
            <span class="col-span-2 truncate">产出 {{ fmtTime(animal.produce_ready_at_ms) }}</span>
          </div>

          <div class="mt-3 flex flex-wrap gap-1.5">
            <BaseButton size="sm" variant="ghost" :loading="acting" @click="doTriggerSlot(ranch, animal)">生产</BaseButton>
            <BaseButton size="sm" variant="ghost" :loading="acting" @click="doStroke(ranch, animal)">撸一撸</BaseButton>
            <BaseButton size="sm" variant="outline" :disabled="!(Number(animal.can_feed) > 0)" :loading="acting" @click="doFeedOne(ranch, animal)">投喂</BaseButton>
          </div>
        </article>
      </div>
    </section>

    <!-- 底部功能卡 -->
    <div class="grid gap-4 md:grid-cols-3">
      <!-- 牧草机 -->
      <section class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/60">
        <div class="mb-1 flex items-center justify-between">
          <div class="text-xs text-gray-400 tracking-widest">FED MACHINE</div>
          <span class="i-carbon-sprout text-lg text-green-500" />
        </div>
        <h3 class="mb-3 text-sm text-gray-800 font-semibold dark:text-gray-100">牧草机</h3>
        <div class="mb-3 flex gap-2">
          <div class="flex-1 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
            <div class="text-xs text-gray-400">牧草状态</div>
            <div class="text-sm text-gray-700 font-medium dark:text-gray-200">
              {{ (ranches[0]?.grass_ok ?? false) ? '充足' : '不足/未知' }}
            </div>
          </div>
          <div class="flex-1 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
            <div class="text-xs text-gray-400">加料数量</div>
            <BaseInput v-model.number="addFeedCount" type="number" min="1" placeholder="100" />
          </div>
        </div>
        <BaseButton size="sm" variant="primary" block :loading="acting" @click="doAddFeed">加料</BaseButton>
        <p class="mt-2 text-xs text-gray-400">设施实例 10002 · 抓包样本协议</p>
      </section>

      <!-- 每日操作额度 -->
      <section class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/60">
        <div class="mb-1 flex items-center justify-between">
          <div class="text-xs text-gray-400 tracking-widest">DAILY LIMIT</div>
          <span class="i-carbon-chart-ring text-lg text-amber-500" />
        </div>
        <h3 class="mb-3 text-sm text-gray-800 font-semibold dark:text-gray-100">每日操作额度</h3>
        <div v-if="!opTimes.length" class="text-sm text-gray-400">暂无数据</div>
        <div v-else class="space-y-1.5">
          <div v-for="o in opTimes" :key="String(o.op_id)" class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-xs dark:bg-gray-900/40">
            <span class="text-gray-500 dark:text-gray-400">操作 {{ o.op_id }}</span>
            <span class="rounded-full bg-white px-2 py-0.5 text-gray-700 font-medium dark:bg-gray-700 dark:text-gray-200">{{ opText(o) }}</span>
          </div>
        </div>
      </section>

      <!-- 幼崽入栏 -->
      <section class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/60">
        <div class="mb-1 flex items-center justify-between">
          <div class="text-xs text-gray-400 tracking-widest">PLACE CUB</div>
          <span class="i-carbon-add-alt text-lg text-sky-500" />
        </div>
        <h3 class="mb-3 text-sm text-gray-800 font-semibold dark:text-gray-100">幼崽入栏</h3>
        <div class="space-y-2">
          <BaseInput v-model.number="placeRanchInstId" label="栏舍实例 ID" type="number" />
          <div class="flex gap-2">
            <BaseInput v-model.number="placeAnimalId" label="动物 ID" type="number" />
            <BaseInput v-model.number="placeGiantCubItemId" label="巨崽道具 ID（可选）" type="number" />
          </div>
          <BaseButton size="sm" variant="primary" block :loading="acting" @click="doPlace">入栏</BaseButton>
        </div>
      </section>
    </div>

    <!-- 投喂罐头桶（单只） -->
    <section class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/60">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span class="i-carbon-clean text-base text-green-600 dark:text-green-400" />
        <h3 class="text-sm text-gray-800 font-semibold dark:text-gray-100">投喂罐头桶</h3>
        <span class="text-xs text-gray-400">对指定动物实例投喂（也可在上方卡片直接点「投喂」）</span>
        <div class="ml-auto w-32">
          <BaseInput v-model.number="feedCount" label="数量" type="number" min="1" />
        </div>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <div class="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
          卡片上点「投喂」会自动带上栏舍与动物实例 ID；此处保留手动表单以便核对协议字段。
        </div>
        <div class="flex items-end gap-2">
          <span class="flex-1 text-xs text-gray-400">动物实例 ID 与栏舍实例 ID 取自卡片数据，无需手填。</span>
        </div>
      </div>
    </section>

    <p class="text-xs text-gray-400">
      说明：页面只提供有成功抓包样本的操作。收取副产品 / 出栏 / 出售产物 / 偷产物 / 单栏清理 / 放蚊子暂无协议样本，未实现；重量奖励、补给商店同理。
    </p>
  </div>
</template>
