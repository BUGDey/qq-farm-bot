export function positiveRanchCount(value: unknown): number | null {
  const count = Number(value)
  return Number.isSafeInteger(count) && count > 0 ? count : null
}
