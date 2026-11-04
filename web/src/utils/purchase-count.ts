/**
 * 购买/兑换数量上限的计算工具。
 *
 * 上限要同时满足三个条件，取三者最小值：
 *   1. 限购剩余（商店的每日/每周/永久限购）
 *   2. 余额可买数量（floor(余额 / 单价)，有多种货币费用时取最紧的一种）
 *   3. 硬上限（默认 9999，避免输入框出现天文数字）
 *
 * 余额或单价未知时**不能**当成 0 处理，否则会误报「买不起」；
 * 这类费用直接跳过，由服务端的校验兜底。
 */

export interface PurchaseCost {
  id?: number | string
  count?: number
  balance?: number | null
}

/** 按余额能买多少份：各种费用取最小的 floor(余额 / 单价)。没有任何费用可参考时返回 Infinity。 */
export function affordableCount(costs: PurchaseCost[]): number {
  let max = Number.POSITIVE_INFINITY
  for (const cost of costs || []) {
    const price = Number(cost?.count)
    const balance = cost?.balance
    if (!Number.isFinite(price) || price <= 0)
      continue
    if (balance == null || !Number.isFinite(Number(balance)))
      continue
    max = Math.min(max, Math.floor(Number(balance) / price))
  }
  return max
}

export function purchaseMaxCount(options: { limitRemaining?: number | null, costs?: PurchaseCost[], cap?: number }): number {
  const cap = options.cap ?? 9999
  const limit = options.limitRemaining
  return Math.max(1, Math.min(
    cap,
    limit != null && Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : cap,
    affordableCount(options.costs || []),
  ))
}
