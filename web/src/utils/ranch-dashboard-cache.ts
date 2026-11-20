/**
 * Ranch dashboard cold-start display cache.
 *
 * Only read-only display snapshots (ranch status, profile, illustrated) are
 * persisted, keyed by account id. Sensitive/derived/action data (tokens,
 * balances, logs, connection state, operation results, XP observation samples)
 * is deliberately excluded. Every access is best-effort and must never block
 * or change the live network refresh path.
 */

const STORAGE_PREFIX = 'ranch:dashboard:cache:v1:'
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // stale snapshots stop being reused after 7 days
const MAX_ITEMS = 200
const MAX_JSON_CHARS = 48_000

type AnyRecord = Record<string, any>

export interface RanchDashboardCacheEntry {
  profile: AnyRecord | null
  illustrated: AnyRecord | null
  snapshot: AnyRecord | null
  savedAt: number
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function isRecord(value: unknown): value is AnyRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function safeStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined' || !localStorage)
      return null
    return localStorage
  }
  catch {
    return null
  }
}

export function ranchDashboardCacheKey(accountId: string): string {
  return `${STORAGE_PREFIX}${accountId}`
}

/** Copy a value after dropping functions/symbols. Plain display data only. */
function copyJson<T>(value: T): T | null {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  }
  catch {
    return null
  }
}

function sanitizeProfile(raw: unknown): AnyRecord | null {
  if (!isRecord(raw))
    return null
  const copy = copyJson(raw)
  return isRecord(copy) ? copy : null
}

function sanitizeIllustrated(raw: unknown): AnyRecord | null {
  if (!isRecord(raw))
    return null
  const copy = copyJson(raw)
  return isRecord(copy) ? copy : null
}

function sanitizeSnapshot(raw: unknown): AnyRecord | null {
  if (!isRecord(raw))
    return null
  const snapshot: AnyRecord = {}
  if (Array.isArray(raw.items))
    snapshot.items = copyJson(raw.items.slice(0, MAX_ITEMS)) ?? []
  if (isRecord(raw.sectionErrors))
    snapshot.sectionErrors = copyJson(raw.sectionErrors) ?? {}
  if (isRecord(raw.nextChecks))
    snapshot.nextChecks = copyJson(raw.nextChecks) ?? {}
  return Object.keys(snapshot).length ? snapshot : null
}

/** Read one account's display snapshot. Corrupt/expired/unexpected data is ignored. */
export function readRanchDashboardCache(accountId: string): RanchDashboardCacheEntry | null {
  if (!accountId)
    return null
  const storage = safeStorage()
  if (!storage)
    return null
  try {
    const raw = storage.getItem(ranchDashboardCacheKey(accountId))
    if (!raw || raw.length > MAX_JSON_CHARS)
      return null
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1 || !Number.isFinite(parsed.savedAt))
      return null
    if (Date.now() - Number(parsed.savedAt) > TTL_MS)
      return null
    return {
      profile: sanitizeProfile(parsed.profile),
      illustrated: sanitizeIllustrated(parsed.illustrated),
      snapshot: sanitizeSnapshot(parsed.snapshot),
      savedAt: Number(parsed.savedAt),
    }
  }
  catch {
    return null
  }
}

export interface RanchDashboardCacheInput {
  profile?: unknown
  illustrated?: unknown
  snapshot?: unknown
}

/**
 * Persist one account's display snapshot. Inputs that are missing or came from
 * a failed/empty read are skipped so stale data is never overwritten with
 * zeroes. Returns false when there was nothing safe to write or storage failed.
 */
export function writeRanchDashboardCache(accountId: string, input: RanchDashboardCacheInput): boolean {
  if (!accountId)
    return false
  const profile = sanitizeProfile(input.profile)
  const illustrated = sanitizeIllustrated(input.illustrated)
  const snapshot = sanitizeSnapshot(input.snapshot)
  if (!profile && !illustrated && !snapshot)
    return false
  const storage = safeStorage()
  if (!storage)
    return false
  const entry: RanchDashboardCacheEntry = { profile, illustrated, snapshot, savedAt: Date.now() }
  const raw = JSON.stringify({ version: 1, ...entry })
  if (raw.length > MAX_JSON_CHARS)
    return false
  try {
    storage.setItem(ranchDashboardCacheKey(accountId), raw)
    return true
  }
  catch {
    return false
  }
}

/** Remove one account's snapshot (e.g. on account deletion). Best-effort. */
export function clearRanchDashboardCache(accountId: string): void {
  if (!accountId)
    return
  const storage = safeStorage()
  if (!storage)
    return
  try {
    storage.removeItem(ranchDashboardCacheKey(accountId))
  }
  catch { /* storage unavailable: nothing to clear */ }
}
