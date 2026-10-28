// 与宿主 web/src/utils/number-format.ts 的 formatWanAmount 行为一致（内联副本，
// 插件自包含构建不引宿主模块）。
const WAN_UNIT = '万'
const YI_UNIT = '亿'
const WAN_THRESHOLD = 10000
const YI_THRESHOLD = 100000000

function toFiniteNumber(value) {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

export function formatWanAmount(value) {
  const amount = toFiniteNumber(value)
  const absAmount = Math.abs(amount)
  if (absAmount >= YI_THRESHOLD)
    return `${(amount / YI_THRESHOLD).toFixed(2)}${YI_UNIT}`
  if (absAmount >= WAN_THRESHOLD)
    return `${(amount / WAN_THRESHOLD).toFixed(2)}${WAN_UNIT}`
  return amount.toLocaleString('zh-CN')
}
