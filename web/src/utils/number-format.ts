export const DASHBOARD_EMPTY = '—'

/**
 * 只把「没查到」的情况显示成占位符：null / undefined / 空串 / NaN / Infinity。
 * 服务端明确返回的 0 是有效数据，照常显示成 0。
 */
export function formatDashboardValue(value: unknown, format: (amount: number) => string = String): string {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim()))
    return DASHBOARD_EMPTY
  const amount = Number(value)
  return Number.isFinite(amount) ? format(amount) : DASHBOARD_EMPTY
}

export type ResourceCurrency = 'gold' | 'coupon' | 'goldBean'

const WAN_UNIT = '\u4E07'
const YI_UNIT = '\u4EBF'
const WAN_THRESHOLD = 10000
const YI_THRESHOLD = 100000000

function toFiniteNumber(value: unknown) {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function formatCompactAmount(value: unknown) {
  const amount = toFiniteNumber(value)
  const absAmount = Math.abs(amount)
  if (absAmount >= YI_THRESHOLD)
    return `${(amount / YI_THRESHOLD).toFixed(2)}${YI_UNIT}`
  if (absAmount >= WAN_THRESHOLD)
    return `${(amount / WAN_THRESHOLD).toFixed(2)}${WAN_UNIT}`
  return amount.toLocaleString('zh-CN')
}

export function formatGoldAmount(value: unknown) {
  return formatWanAmount(value)
}

export function formatWanAmount(value: unknown) {
  return formatCompactAmount(value)
}

export function formatCouponAmount(value: unknown) {
  return formatWanAmount(value)
}

export function formatGoldBeanAmount(value: unknown) {
  return formatWanAmount(value)
}

export function formatCurrencyAmount(value: unknown, currency: ResourceCurrency) {
  if (currency === 'gold')
    return formatGoldAmount(value)
  return formatWanAmount(value)
}

export function formatCurrencyAmountByLabel(value: unknown, label: string) {
  const text = String(label || '')
  if (text.includes('\u91D1\u5E01'))
    return formatGoldAmount(value)
  if (text.includes('\u70B9\u5238') || text.includes('\u91D1\u8C46\u8C46'))
    return formatWanAmount(value)
  return toFiniteNumber(value).toLocaleString('zh-CN')
}
