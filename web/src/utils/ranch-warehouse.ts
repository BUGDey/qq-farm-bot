export type WarehouseAction = 'sell' | 'useCan'

interface SalePrice {
  id: string
  count: string
  name?: string
}

export function warehouseItemKey(item: { id: unknown, uid?: unknown }) {
  return `${item.id}:${item.uid || '0'}`
}

export function validWarehouseCount(count: number, stock: unknown) {
  return Number.isSafeInteger(count) && count >= 1 && count <= Math.min(Number(stock), 99999)
}

export function warehouseSaleRewards(prices: SalePrice[] | undefined, count: number): SalePrice[] {
  if (!prices?.length || !Number.isSafeInteger(count) || count < 1 || count > 99999)
    return []
  return prices.map(price => ({ ...price, count: String(BigInt(price.count) * BigInt(count)) }))
}

function rewardSignature(rows: SalePrice[]) {
  return JSON.stringify(rows.map(({ id, count }) => [id, count]))
}

export function canConfirmWarehouseAction(pending: any, live: any, count: number, accountId: string) {
  if (!pending || !live || pending.accountId !== accountId || warehouseItemKey(pending) !== warehouseItemKey(live)
    || live.locked || !validWarehouseCount(count, live.count)) {
    return false
  }
  if (pending.action === 'useCan')
    return Boolean(live.canUseCan)
  if (pending.action !== 'sell')
    return false
  const expected = warehouseSaleRewards(pending.manualSellPrices, count)
  return expected.length > 0 && rewardSignature(expected) === rewardSignature(warehouseSaleRewards(live.manualSellPrices, count))
}
