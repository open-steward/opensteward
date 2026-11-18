export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

/**
 * SignEasy documents its timestamps as integer Unix seconds
 * (`"created_time": 1574307538`, `"last_modified_time": 1574307655`,
 * `"expiry_time": 1815053834`).
 */
export function epochSecondsToIso(v: unknown): string | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return new Date(v * 1000).toISOString()
}

/** Documented integer ids, as the canonical string id. Throws when absent. */
export function requireId(v: unknown, what: string): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'string' && v.length > 0) return v
  throw new Error(`SignEasy ${what} carries no id`)
}

/** A documented string field every response carries. Throws when absent. */
export function requireStr(v: unknown, what: string): string {
  const s = pickStr(v)
  if (s === undefined) throw new Error(`SignEasy ${what} is missing`)
  return s
}
