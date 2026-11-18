export function warehouseItemKey(item: { id: unknown, uid?: unknown }) {
  return `${item.id}:${item.uid || '0'}`
}

export function validWarehouseCount(count: number, stock: unknown) {
  return Number.isSafeInteger(count) && count >= 1 && count <= Math.min(Number(stock), 99999)
}

export function canConfirmWarehouseAction(pending: any, live: any, count: number, accountId: string) {
  return Boolean(pending && live && pending.accountId === accountId
    && warehouseItemKey(pending) === warehouseItemKey(live)
    && !live.locked && validWarehouseCount(count, live.count)
    && (pending.canUseCan ? live.canUseCan : live.canSell && !live.detail?.ranchProduct))
}
