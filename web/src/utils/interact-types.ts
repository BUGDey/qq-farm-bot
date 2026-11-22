// 互动记录类型（gamepb.interactpb.InteractRecord.action_type）
// 2026-11 抓包里偷取记录的 action_type 是 13（带 crop_id / crop_count），
// 旧版是 1；9 / 11 缺字段证据，只能当未知互动，不能算进偷取或帮忙。
export const STEAL_ACTION_TYPES: readonly number[] = [1, 13]
export const HELP_ACTION_TYPES: readonly number[] = [2]
export const NUISANCE_ACTION_TYPES: readonly number[] = [3]

export function isStealAction(actionType: unknown): boolean {
  return STEAL_ACTION_TYPES.includes(Number(actionType))
}

export function isHelpAction(actionType: unknown): boolean {
  return HELP_ACTION_TYPES.includes(Number(actionType))
}

export function isNuisanceAction(actionType: unknown): boolean {
  return NUISANCE_ACTION_TYPES.includes(Number(actionType))
}
