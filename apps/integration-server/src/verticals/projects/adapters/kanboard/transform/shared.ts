export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  return String(v)
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
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
 * Convert a value to a strict ISO-8601 datetime string.
 * Accepts ISO strings, Unix timestamps (seconds as string or number), or any
 * date-parseable string. Returns undefined for missing/unparseable values.
 * Transforms never throw.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = typeof s === 'string' ? s : String(s)
  if (!str || str === '0') return undefined

  // Kanboard stores dates as Unix timestamps (seconds) — detect numeric strings
  const asNum = Number(str)
  if (!Number.isNaN(asNum) && asNum > 0) {
    return new Date(asNum * 1000).toISOString()
  }

  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
