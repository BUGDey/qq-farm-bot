export function ranchAnimalProgress(animal: any, now: number) {
  const stage = Number(animal.stage)
  const deadline = Number(({ 1: animal.infantReadyAtMs, 2: animal.growReadyAtMs, 3: animal.produceReadyAtMs, 4: animal.matureReadyAtMs } as Record<number, unknown>)[stage])
  const label = ({ 1: '幼年结束', 2: '长大', 3: '下次产出', 4: '成熟' } as Record<number, string>)[stage] || '阶段完成'
  const result = { label, deadline: 0, remaining: '', percent: null as number | null, note: '', paused: false }
  if (animal.canHarvest || stage === 5)
    return { ...result, note: '可收获动物' }
  if (animal.grassBlocked)
    return { ...result, paused: true, note: '牧草不足，等待恢复' }
  if (stage === 3 && !animal.producing)
    return { ...result, note: animal.canTriggerProduce ? '待开始生产' : '等待生产状态更新' }
  if (!Number.isFinite(deadline) || deadline <= 0)
    return { ...result, note: '阶段时间待同步' }
  const remaining = Math.max(0, deadline - now)
  const duration = Number(animal.phaseDurationMs)
  const seconds = Math.ceil(remaining / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor(seconds % 86400 / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const text = `${days ? `${days}天 ` : ''}${hours ? `${hours}小时 ` : ''}${minutes ? `${minutes}分 ` : ''}${seconds % 60}秒`
  return {
    ...result,
    deadline,
    remaining: text,
    percent: Number.isFinite(duration) && duration > 0 ? Math.round(Math.max(0, Math.min(1, 1 - remaining / duration)) * 100) : null,
    note: remaining > 0 ? `距离${label}` : '时间已到，等待状态同步',
  }
}

export function ranchSnapshotNow(data: any, localNow: number) {
  const serverTime = Number(data?.serverTime)
  const syncedAt = Number(data?.syncedAt)
  return Number.isFinite(serverTime) && Number.isFinite(syncedAt) && serverTime > 0 && syncedAt > 0 ? serverTime + Math.max(0, localNow - syncedAt) : localNow
}
