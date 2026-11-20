interface RanchLevelProgress {
  current?: unknown
  needed?: unknown
}

export function readRanchExp(value: unknown): number | null {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value)))
    return null
  const exp = Number(value)
  return Number.isSafeInteger(exp) && exp >= 0 ? exp : null
}

interface RanchExpSample {
  accountId: string
  exp: unknown
  at: number
  sessionUptime?: unknown
}

// This is a page observation window, not the worker's farm XP session.
// No persistence: account changes, unavailable reads and long background gaps start fresh.
export const RANCH_EXP_MAX_GAP_MS = 120000

export function createRanchExpSampler(maxGapMs = RANCH_EXP_MAX_GAP_MS) {
  let baseline: { accountId: string, exp: number, at: number } | null = null
  let last: { exp: number, at: number, sessionUptime: number | null } | null = null
  const reset = () => { baseline = null; last = null }
  function sample(input: RanchExpSample) {
    const exp = readRanchExp(input.exp)
    const sessionUptime = typeof input.sessionUptime === 'number' && Number.isFinite(input.sessionUptime) && input.sessionUptime >= 0 ? input.sessionUptime : null
    if (!input.accountId || exp === null || !Number.isFinite(input.at)) {
      reset()
      return null
    }
    if (!baseline || !last || input.accountId !== baseline.accountId || exp < last.exp
      || input.at <= last.at || input.at - last.at > maxGapMs
      || (sessionUptime !== null && last.sessionUptime !== null && sessionUptime < last.sessionUptime)) {
      baseline = { accountId: input.accountId, exp, at: input.at }
      last = { exp, at: input.at, sessionUptime }
      return { gain: null, seconds: null }
    }
    last = { exp, at: input.at, sessionUptime }
    return { gain: exp - baseline.exp, seconds: (input.at - baseline.at) / 1000 }
  }
  return { sample, reset }
}

export function ranchExpForecast(progress: RanchLevelProgress | null | undefined, gain: unknown, seconds: unknown) {
  const current = readRanchExp(progress?.current)
  const needed = readRanchExp(progress?.needed)
  const remaining = current !== null && needed !== null && needed > 0 ? Math.max(0, needed - current) : null
  const earned = readRanchExp(gain)
  const rate = earned !== null && typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? earned * 3600 / seconds
    : null
  const ratePerHour = rate !== null && Number.isFinite(rate) ? rate : null
  const minutes = remaining !== null && ratePerHour !== null && ratePerHour > 0 ? remaining / ratePerHour * 60 : null

  let eta = '暂无法估算'
  if (remaining === 0) {
    eta = '经验已达升级要求'
  }
  else if (minutes !== null && Number.isFinite(minutes)) {
    if (minutes < 60)
      eta = `约 ${Math.max(1, Math.ceil(minutes))} 分钟后升级`
    else if (minutes < 1440)
      eta = `约 ${(minutes / 60).toFixed(1)} 小时后升级`
    else
      eta = `约 ${(minutes / 1440).toFixed(1)} 天后升级`
  }

  return {
    rate: ratePerHour === null ? '未知' : ratePerHour > 0 && ratePerHour < 1 ? '<1/小时' : `${Math.floor(ratePerHour).toLocaleString('zh-CN')}/小时`,
    eta,
    remaining: remaining === null ? '剩余经验未知' : `还差 ${remaining.toLocaleString('zh-CN')} 经验`,
  }
}
