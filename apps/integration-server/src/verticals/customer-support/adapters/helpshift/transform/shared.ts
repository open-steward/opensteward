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
 * Convert a value to strict ISO-8601 datetime string.
 * Accepts ISO strings or Unix timestamps (ms or s).
 * Helpshift timestamps are Unix milliseconds (numbers).
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  if (typeof s === 'number') {
    // Heuristic: values < 1e12 are seconds; >= 1e12 are milliseconds
    const ms = s < 1e12 ? s * 1000 : s
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return undefined
    return d.toISOString()
  }
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
