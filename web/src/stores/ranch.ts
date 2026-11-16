import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export interface RanchAnimal {
  ranch_inst_id: number | string
  slot_index: number
  animal_inst_id: number
  animal_id: number | string
  stage: number
  produce_count: number
  can_harvest: number
  grow_ready_at_ms: number | string
  produce_ready_at_ms: number | string
  grass_blocked: number
  infant_ready_at_ms: number | string
  producing: number
  can_deliver: number
  can_feed: number
  can_donate: number
  expected_harvest_exp: number | string
  expected_produce_exp: number | string
  mutation?: Record<string, any> | null
  // 后端在 HTTP 边界补的展示字段（不来自 protobuf）
  animal_name?: string
  animal_image?: string
}

export interface RanchData {
  ranch_inst_id: number | string
  capacity: number
  animal_count: number
  animals: RanchAnimal[]
  grass?: string
  grass_ok?: boolean
  husbandry_type?: number
}

export interface OpTimes {
  op_id: number | string
  count: number | string
  limit: number | string
}

export const useRanchStore = defineStore('ranch', () => {
  const ranches = ref<RanchData[]>([])
  const opTimes = ref<OpTimes[]>([])
  const loading = ref(false)
  const acting = ref(false)
  const error = ref('')

  async function fetchDetail(accountId: string, hostGid = 0) {
    if (!accountId) return
    loading.value = true
    error.value = ''
    try {
      const { data } = await api.get('/api/ranch/detail', {
        params: { host_gid: hostGid },
        headers: { 'x-account-id': accountId },
      })
      if (data?.ok) {
        ranches.value = data.data?.ranches || []
      } else {
        error.value = data?.error || '获取牧场详情失败'
      }
      return data
    } catch (err: any) {
      error.value = err?.message || '获取牧场详情失败'
    } finally {
      loading.value = false
    }
  }

  async function fetchOpTimes(accountId: string) {
    if (!accountId) return
    try {
      const { data } = await api.get('/api/ranch/op-times', {
        headers: { 'x-account-id': accountId },
      })
      if (data?.ok) opTimes.value = data.data?.op_times || []
      return data
    } catch (err: any) {
      error.value = err?.message || '获取使坏次数失败'
    }
  }

  async function act(accountId: string, action: string, payload: Record<string, any> = {}) {
    if (!accountId) return
    acting.value = true
    try {
      const { data } = await api.post(`/api/ranch/${action}`, payload, {
        headers: { 'x-account-id': accountId },
      })
      return data
    } finally {
      acting.value = false
    }
  }

  return {
    ranches,
    opTimes,
    loading,
    acting,
    error,
    fetchDetail,
    fetchOpTimes,
    act,
  }
})
