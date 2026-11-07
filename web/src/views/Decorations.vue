<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import { useToastStore } from '@/stores/toast'

interface DecorationItem {
  id: number
  name: string
  category: string
  categoryLabel: string
  image: string
  desc: string
  effectDesc: string
  rarity: number
  rarityColor: string
  ownedCount: number
  owned: boolean
  equipped: boolean
}

interface DecorationCategory {
  key: string
  label: string
  items: DecorationItem[]
}

interface DecorationSnapshot {
  fetchedAt: string
  categories: DecorationCategory[]
  total: number
  ownedTotal: number
  equippedTotal?: number
  skin?: { owned: number | null, equipped: number | null, error: string }
  frame?: { owned: number | null, error: string }
  bag?: { size: number | null, error: string, matched: number }
  shop?: { unlocked: number | null, error: string }
}

const toast = useToastStore()

const loading = ref(false)
const snapshot = ref<DecorationSnapshot | null>(null)
const activeKey = ref('')
const errorText = ref('')
const equipTarget = ref<DecorationItem | null>(null)
const equipping = ref(false)
const diagOpen = ref(false)
const diagLoading = ref(false)
const diagText = ref('')

const activeCategory = computed(() =>
  snapshot.value?.categories.find(category => category.key === activeKey.value) || null,
)

const ownedTotal = computed(() => snapshot.value?.ownedTotal || 0)
const totalCount = computed(() => snapshot.value?.total || 0)

// 一件都没解锁时，给出可复现的排查信息（哪个接口失败、各自拿到多少）
const bagHint = computed(() => {
  const snapshotValue = snapshot.value
  if (!snapshotValue || snapshotValue.ownedTotal)
    return ''
  const skin = snapshotValue.skin
  const frame = snapshotValue.frame
  if (skin?.error)
    return `读取已解锁装扮失败（这是判断「已拥有」的主要来源）：${skin.error}`
  const parts = [`SkinService 返回 ${skin?.owned ?? 0} 件已解锁装扮`]
  if (frame)
    parts.push(`头像框 ${frame.owned ?? 0} 个`)
  if (snapshotValue.bag)
    parts.push(`背包 ${snapshotValue.bag.size ?? 0} 件物品`)
  parts.push('如果游戏里明明已经解锁，多半是账号没在线，稍后点刷新再试')
  return `${parts.join('，')}。`
})

async function loadDecorations() {
  loading.value = true
  errorText.value = ''
  try {
    const { data } = await api.get('/api/decorations', { timeout: 60000 })
    if (!data?.ok) {
      errorText.value = data?.error || '获取装扮失败'
      snapshot.value = null
      return
    }
    snapshot.value = data.data as DecorationSnapshot
    if (!activeKey.value || !snapshot.value.categories.some(c => c.key === activeKey.value))
      activeKey.value = snapshot.value.categories[0]?.key || ''
  }
  catch (error: any) {
    errorText.value = error?.response?.data?.error || error?.message || '获取装扮失败'
    snapshot.value = null
  }
  finally {
    loading.value = false
  }
}

function openEquip(item: DecorationItem) {
  if (!item.owned)
    return
  equipTarget.value = item
}

// 诊断：把 SkinService / 头像框 / 商城 / 背包 三路来源的原始 ID 全部打印出来
async function openDiagnostics() {
  diagLoading.value = true
  try {
    const { data } = await api.get('/api/decorations/diagnostics', { timeout: 90000 })
    if (!data?.ok) {
      useToastStore().error(data?.error || '诊断失败')
      return
    }
    diagText.value = JSON.stringify(data.data, null, 2)
    diagOpen.value = true
  }
  catch (error: any) {
    useToastStore().error(error?.response?.data?.error || error?.message || '诊断失败')
  }
  finally {
    diagLoading.value = false
  }
}

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(diagText.value)
    useToastStore().success('已复制，直接发给作者即可')
  }
  catch {
    useToastStore().error('复制失败，请手动选中文本')
  }
}

function closeEquip() {
  if (equipping.value)
    return
  equipTarget.value = null
}

async function confirmEquip() {
  const item = equipTarget.value
  if (!item || equipping.value)
    return
  equipping.value = true
  try {
    const { data } = await api.post('/api/decorations/equip', { itemId: item.id }, { skipErrorToast: true } as any)
    if (data?.ok) {
      toast.success(`已换上「${item.name}」`)
      equipTarget.value = null
      await loadDecorations()
    }
    else {
      toast.error(data?.error || '装备失败')
    }
  }
  catch (error: any) {
    const payload = error?.response?.data
    toast.error(payload?.error || error?.message || '装备失败')
  }
  finally {
    equipping.value = false
  }
}

onMounted(loadDecorations)
</script>

<template>
  <div class="decorations-page">
    <div class="page-head">
      <div>
        <h1 class="page-title">
          装扮
        </h1>
        <p class="page-sub">
          小屋 / 木牌 / 栅栏 / 围栏等装扮一览，已拥有 {{ ownedTotal }}/{{ totalCount }}
        </p>
      </div>
      <button class="refresh-btn" :disabled="loading" @click="loadDecorations">
        <span class="i-carbon-renew" :class="{ spinning: loading }" />
        {{ loading ? '读取中' : '刷新' }}
      </button>
      <button class="refresh-btn" :disabled="diagLoading" @click="openDiagnostics">
        <span class="i-carbon-stethoscope" />
        {{ diagLoading ? '诊断中' : '诊断' }}
      </button>
    </div>

    <div v-if="diagOpen" class="diag-mask" @click.self="diagOpen = false">
      <div class="diag-card">
        <div class="diag-head">
          <span>装扮来源诊断（只读）</span>
          <button class="diag-close" @click="diagOpen = false">
            ×
          </button>
        </div>
        <pre class="diag-body">{{ diagText }}</pre>
        <div class="diag-foot">
          <button class="btn-ghost" @click="copyDiagnostics">
            复制
          </button>
        </div>
      </div>
    </div>

    <div v-if="errorText" class="error-card">
      {{ errorText }}
    </div>

    <div v-if="bagHint" class="hint-card">
      {{ bagHint }}
    </div>

    <div v-if="snapshot" class="tabs">
      <button
        v-for="category in snapshot.categories"
        :key="category.key"
        class="tab"
        :class="{ active: category.key === activeKey }"
        @click="activeKey = category.key"
      >
        {{ category.label }}
        <span class="tab-count">{{ category.items.filter(i => i.owned).length }}/{{ category.items.length }}</span>
      </button>
    </div>

    <div v-if="activeCategory" class="grid">
      <div
        v-for="item in activeCategory.items"
        :key="item.id"
        class="card"
        :class="{ owned: item.owned, equipped: item.equipped }"
      >
        <div class="thumb">
          <img v-if="item.image" :src="item.image" :alt="item.name">
          <div v-else class="thumb-empty">
            <span class="i-carbon-image text-2xl" />
          </div>
          <span v-if="item.equipped" class="badge badge-on">使用中</span>
          <span v-else-if="!item.owned" class="badge badge-off">未拥有</span>
        </div>
        <div class="name" :title="item.desc || item.name">
          {{ item.name }}
        </div>
        <button
          class="equip-btn"
          :disabled="!item.owned || item.equipped"
          @click="openEquip(item)"
        >
          {{ item.equipped ? '当前使用' : item.owned ? '替换' : '未拥有' }}
        </button>
      </div>
    </div>

    <div v-else-if="loading" class="empty">
      正在读取装扮…
    </div>
    <div v-else class="empty">
      暂无装扮数据
    </div>

    <Teleport to="body">
      <div v-if="equipTarget" class="modal-mask" @click.self="closeEquip">
        <div class="modal-card">
          <div class="modal-head">
            <img v-if="equipTarget.image" :src="equipTarget.image" class="modal-thumb" :alt="equipTarget.name">
            <div>
              <div class="modal-title">
                换上「{{ equipTarget.name }}」
              </div>
              <div class="modal-sub">
                分类：{{ equipTarget.categoryLabel }}
              </div>
            </div>
          </div>
          <p class="modal-tip">
            替换会直接下发到游戏（Equip），成功后游戏里的外观立即变化；失败时这里会显示游戏返回的错误。
          </p>
          <div class="modal-actions">
            <button class="btn-ghost" :disabled="equipping" @click="closeEquip">
              取消
            </button>
            <button class="btn-primary" :disabled="equipping" @click="confirmEquip">
              {{ equipping ? '提交中…' : '确认替换' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.decorations-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: 0 8px 24px rgba(31, 38, 80, 0.08);
  backdrop-filter: blur(12px);
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
}

.page-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: #6b7280;
}

.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 999px;
  background: #2ecc71;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-card {
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(254, 226, 226, 0.85);
  color: #b91c1c;
  font-size: 13px;
}

.hint-card {
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(254, 249, 195, 0.8);
  color: #92400e;
  font-size: 13px;
  line-height: 1.5;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: none;
  border-radius: 10px;
  background: rgba(243, 244, 246, 0.9);
  color: #4b5563;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.tab.active {
  background: #2ecc71;
  color: #fff;
}

.tab-count {
  font-size: 11px;
  opacity: 0.75;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 12px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(229, 231, 235, 0.9);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 4px 14px rgba(31, 38, 80, 0.06);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.card.equipped {
  border-color: #2ecc71;
  box-shadow: 0 6px 18px rgba(46, 204, 113, 0.22);
}

.thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  background: linear-gradient(160deg, #f7fafc 0%, #eef6ef 100%);
  overflow: hidden;
}

.thumb img {
  max-width: 82%;
  max-height: 82%;
  object-fit: contain;
}

.thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #cbd5e1;
}

.badge {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.badge-on {
  background: rgba(46, 204, 113, 0.92);
  color: #fff;
}

.badge-off {
  background: rgba(148, 163, 184, 0.85);
  color: #fff;
}

.name {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.equip-btn {
  padding: 6px 0;
  border: none;
  border-radius: 8px;
  background: #2ecc71;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.equip-btn:disabled {
  background: #e5e7eb;
  color: #9ca3af;
  cursor: default;
}

.empty {
  padding: 32px;
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
}

.modal-card {
  width: 100%;
  max-width: 420px;
  padding: 18px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.28);
}

.modal-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-thumb {
  width: 56px;
  height: 56px;
  object-fit: contain;
  border-radius: 12px;
  background: #f1f5f9;
}

.modal-title {
  font-size: 15px;
  font-weight: 700;
  color: #1f2937;
}

.modal-sub {
  margin-top: 2px;
  font-size: 12px;
  color: #6b7280;
}

.modal-tip {
  margin: 14px 0 18px;
  font-size: 12px;
  line-height: 1.6;
  color: #6b7280;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-ghost,
.btn-primary {
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-ghost {
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #4b5563;
}

.btn-primary {
  border: none;
  background: #2ecc71;
  color: #fff;
}

.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.6;
  cursor: default;
}

.diag-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
  padding: 16px;
}

.diag-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 640px;
  max-height: 80vh;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
  overflow: hidden;
}

.diag-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  font-weight: 600;
  border-bottom: 1px solid #eef1f5;
}

.diag-close {
  border: none;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  color: #94a3b8;
  cursor: pointer;
}

.diag-body {
  flex: 1;
  margin: 0;
  padding: 12px 16px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
  color: #334155;
  background: #f8fafc;
  white-space: pre-wrap;
  word-break: break-all;
}

.diag-foot {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid #eef1f5;
}
</style>
