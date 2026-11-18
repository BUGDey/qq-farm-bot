export const ranchActionLabels: Record<string, string> = {
  visitFriend: '查看好友',
  steal: '偷取产物',
  help: '帮助清理',
  stroke: '照料动物',
  putHazard: '放蚊子',
  sell: '出售产物',
  useCan: '装填罐头',
  buy: '购买商品',
  exchange: '兑换商品',
  feedAnimal: '使用罐头',
  upgradeBuilding: '升级设施',
  completeUpgrade: '完成升级',
  produce: '开始生产',
  collect: '收集产物',
  harvest: '收获动物',
  clean: '清理灾害',
  place: '放入幼崽',
  addFeed: '补充牧草',
  submitOrder: '提交订单',
  refreshOrder: '刷新订单',
  claimIllustrated: '图鉴领奖',
  claimWeight: '重量积分领奖',
}

// Keep the complete statistics grid visible, including before the first request of the day.
export function ranchTodayOperations(operations: Record<string, number> | null | undefined, operationsDate: string | undefined, now: number): Record<string, number> {
  const defaults = Object.fromEntries(Object.keys(ranchActionLabels).map(key => [key, 0]))
  const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10)
  return operationsDate === today ? { ...defaults, ...operations } : defaults
}

export function ranchDate(value: unknown, milliseconds = true) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0)
    return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(number * (milliseconds ? 1 : 1000))
}

export function filterRanchItems(items: any[], tab: string, query: string) {
  const keyword = query.trim().toLowerCase()
  return items.filter(item => (!tab || (item.tabIds || []).some((id: number) => String(id) === tab))
    && (!keyword || `${item.name} ${item.id}`.toLowerCase().includes(keyword)))
}

export function ranchLogBelongs(log: { module: string, source: string, meta: Record<string, any> }, scene: 'farm' | 'ranch') {
  const explicit = log.meta?.scene
  if (explicit === 'shared')
    return true
  if (explicit === 'farm' || explicit === 'ranch')
    return explicit === scene
  if (log.source === 'account' || log.module === 'system')
    return true
  // Legacy ranch logs already carried module=ranch; legacy farm logs did not carry scene.
  return scene === 'ranch' ? log.module === 'ranch' : log.module !== 'ranch'
}
