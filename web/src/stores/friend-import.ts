import { ref } from 'vue'

export interface InviteResultRow {
  accountId: string
  accountName: string
  uid: string
  ok: boolean
  skipped?: boolean
  existing?: boolean
  poolSkipped?: boolean
  limitReached?: boolean
  switchBlocked?: boolean
  visitClosed?: boolean
  level?: number | null
  name?: string
  error?: string
}

// 这些状态放在模块作用域（单例），而不是组件内部：
// 设置页切换页签 / 离开路由时组件会被卸载，但浏览器里已经发出的
// 批量加好友请求链不会停。状态若留在组件里，切回来会显示成「没在跑」，
// 结果和进度也全丢，容易重复提交同一批链接。
// 提升到这里后：任务照常跑完，切回来能继续看到进度与结果。

export const selectedAccountIds = ref<string[]>([])
export const delayMs = ref<number>(2000)
export const minLevel = ref<number>(0)
export const allowUnknownLevel = ref(false)
export const running = ref(false)
export const cancelled = ref(false)
export const progress = ref({ done: 0, total: 0 })
export const results = ref<InviteResultRow[]>([])

/** 当前账号今天是否已撞过好友申请上限（后端号池记录，跨天自动失效） */
export const poolDailyLimit = ref<{ blocked: boolean, dateKey: string, at: number | null, error?: string }>({
  blocked: false,
  dateKey: '',
  at: null,
})
