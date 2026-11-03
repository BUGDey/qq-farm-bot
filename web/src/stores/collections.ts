import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import { useAccountStore } from '@/stores/account'

export interface CollectionReward {
  itemId: number
  count: string
  name: string
  image: string
}

export interface CollectionBuff {
  key: string
  name: string
  description: string
  value: number
}

export interface CollectionItemDto {
  id: number
  name: string
  description: string
  image: string
  starLevel: number
  maxStarLevel: number
  ownCount: number
  activated: boolean
  isNew: boolean
  score: number
  displayed: boolean
  wished: boolean
  requirements: string[]
  unlocked: boolean
  canUpgrade: boolean
  nextStarCosts: CollectionReward[]
}

export interface CollectionSeriesDto {
  id: number
  name: string
  rarity: number
  rarityName: string
  description: string
  requirements: string[]
  mutationRules: Array<{ name: string, probability: number, guarantee: number }>
  activatedCount: number
  totalCount: number
  items: CollectionItemDto[]
}

export interface CollectionMilestoneDto {
  level: number
  score: number
  claimed: boolean
  reached: boolean
  rewards: CollectionReward[]
  buffs: CollectionBuff[]
}

export interface CollectionPedestalDto {
  id: number
  name: string
  image: string
  owned: boolean
}

export interface CollectionsSnapshot {
  category: number
  score: number
  claimedScore: number
  activatedCount: number
  totalCount: number
  nextRewardScore: number | null
  currentBuffs: CollectionBuff[]
  milestones: CollectionMilestoneDto[]
  series: CollectionSeriesDto[]
  display: { itemId: string, pedestalId: string } | null
  pedestals: CollectionPedestalDto[]
  updatedAt: number
}

export interface MutationRarity {
  rarity: number
  percent: number
}

export interface MutationEntry {
  id: number
  name: string
  tag: string
  image: string
  effect: string
  description: string
  probabilities: MutationRarity[]
}

export interface MutationSeriesEntry {
  id: number
  name: string
  rarityName: string
  description: string
  mutationRules: Array<{ name: string, probability: number, guarantee: number }>
  items: Array<{ id: number, name: string, image: string }>
}

export interface MutationCatalog {
  normal: MutationEntry[]
  decoration: MutationEntry[]
  collections: MutationSeriesEntry[]
}

const EMPTY_SNAPSHOT: CollectionsSnapshot = {
  category: 1,
  score: 0,
  claimedScore: 0,
  activatedCount: 0,
  totalCount: 0,
  nextRewardScore: null,
  currentBuffs: [],
  milestones: [],
  series: [],
  display: null,
  pedestals: [],
  updatedAt: 0,
}

export const useCollectionsStore = defineStore('collections', () => {
  const snapshot = ref<CollectionsSnapshot>({ ...EMPTY_SNAPSHOT })
  const catalog = ref<MutationCatalog>({ normal: [], decoration: [], collections: [] })
  const loading = ref(false)
  const catalogLoading = ref(false)
  const error = ref('')
  const catalogError = ref('')
  const pending = ref('')

  let requestSeq = 0

  function currentAccountId() {
    const accountStore = useAccountStore()
    return String((accountStore.currentAccountId as { value?: string })?.value ?? accountStore.currentAccountId ?? '')
  }

  async function fetchSnapshot(accountId = currentAccountId()) {
    if (!accountId)
      return
    const seq = ++requestSeq
    loading.value = true
    error.value = ''
    try {
      const { data } = await api.get('/api/collections', {
        headers: { 'x-account-id': accountId },
      })
      if (seq !== requestSeq)
        return
      if (data?.ok && data.data)
        snapshot.value = { ...EMPTY_SNAPSHOT, ...data.data }
      else
        error.value = data?.error || '获取藏品失败'
    }
    catch (err: any) {
      if (seq === requestSeq)
        error.value = err?.response?.data?.error || err?.message || '获取藏品失败'
    }
    finally {
      if (seq === requestSeq)
        loading.value = false
    }
  }

  async function fetchMutationCatalog(force = false) {
    if (!force && (catalog.value.normal.length || catalog.value.collections.length))
      return
    catalogLoading.value = true
    catalogError.value = ''
    try {
      const { data } = await api.get('/api/illustrated/mutations')
      if (data?.ok && data.data) {
        catalog.value = {
          normal: data.data.normal || [],
          decoration: data.data.decoration || [],
          collections: data.data.collections || [],
        }
      }
      else {
        catalogError.value = data?.error || '获取变异宝典失败'
      }
    }
    catch (err: any) {
      catalogError.value = err?.response?.data?.error || err?.message || '获取变异宝典失败'
    }
    finally {
      catalogLoading.value = false
    }
  }

  async function operate(action: 'upgrade' | 'claim' | 'display', input: Record<string, any> = {}, accountId = currentAccountId()) {
    if (!accountId)
      throw new Error('请先选择账号')
    if (pending.value)
      throw new Error('上一个操作还在进行中')

    pending.value = action
    try {
      const { data } = await api.post(`/api/collections/${action}`, input, {
        headers: { 'x-account-id': accountId },
      })
      if (!data?.ok)
        throw new Error(data?.error || '操作失败')
      if (data.data?.snapshot) {
        requestSeq += 1
        snapshot.value = { ...EMPTY_SNAPSHOT, ...data.data.snapshot }
      }
      return data.data
    }
    finally {
      pending.value = ''
    }
  }

  function reset() {
    requestSeq += 1
    snapshot.value = { ...EMPTY_SNAPSHOT }
    loading.value = false
    error.value = ''
  }

  return {
    snapshot,
    catalog,
    loading,
    catalogLoading,
    error,
    catalogError,
    pending,
    fetchSnapshot,
    fetchMutationCatalog,
    operate,
    reset,
  }
})
