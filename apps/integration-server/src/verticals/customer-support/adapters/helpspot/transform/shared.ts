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
 * HelpSpot timestamps are Unix timestamps (integers) or ISO strings.
 * Returns undefined for missing or unparseable values — never throws.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  // Unix timestamp as number
  if (typeof s === 'number' && s > 0) return new Date(s * 1000).toISOString()
  if (typeof s === 'string' && s !== '') {
    // Numeric string (Unix timestamp)
    const n = Number(s)
    if (!Number.isNaN(n) && n > 0 && !s.includes('-') && !s.includes('T')) {
      return new Date(n * 1000).toISOString()
    }
    // ISO or other date string
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return undefined
}
