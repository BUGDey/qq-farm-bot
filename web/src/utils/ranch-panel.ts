export type RanchPanelAction = 'collect' | 'produce' | 'clean' | 'harvest'

export function ranchPanelActions(data: any, action: RanchPanelAction): any[] {
  if (!data?.sceneReady || !data.capabilities?.[action] || data.sectionErrors?.overview)
    return []
  return (data.ranches || []).flatMap((ranch: any) => {
    const base = { action, ranchId: ranch.ranchInstId }
    if (action === 'collect')
      return (ranch.shelves || []).some((s: any) => s.canCollect) ? [base] : []
    if (action === 'clean')
      return ranch.hazards?.length ? [base] : []
    return (ranch.animals || []).filter((a: any) => action === 'produce' ? a.canTriggerProduce : a.canHarvest).map((animal: any) => ({ ...base, animalInstId: animal.animalInstId }))
  })
}

// Re-read candidates after every request. Stop on error or account/panel changes.
export async function runRanchPanelActions(action: RanchPanelAction, context: {
  data: () => any
  active: () => boolean
  mutate: (payload: any) => Promise<void>
  failed: () => boolean
}) {
  const candidates = ranchPanelActions(context.data(), action)
  for (const candidate of candidates) {
    if (!context.active())
      break
    const eligible = ranchPanelActions(context.data(), action).some(payload =>
      String(payload.ranchId) === String(candidate.ranchId) && String(payload.animalInstId) === String(candidate.animalInstId))
    if (!eligible)
      continue
    await context.mutate(candidate)
    if (context.failed())
      break
  }
}
