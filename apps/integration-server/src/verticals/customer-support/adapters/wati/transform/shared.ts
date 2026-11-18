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
 * toIso — coerces a value to a strict ISO-8601 datetime string.
 *
 * Accepts ISO strings, unix epoch numbers (seconds or ms), and date strings.
 * WATI timestamps may be unix seconds (10-digit) or ISO strings.
 * Returns undefined for missing/unparseable values. Never throws.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  let d: Date
  if (typeof s === 'number') {
    // WATI timestamps may be unix seconds (10 digits) or ms (13 digits)
    d = new Date(s < 1e12 ? s * 1000 : s)
  } else {
    const str = typeof s === 'string' ? s : String(s)
    if (!str) return undefined
    // Try as-is first; if it looks like a plain number string treat as epoch seconds
    if (/^\d+$/.test(str)) {
      const n = Number(str)
      d = new Date(n < 1e12 ? n * 1000 : n)
    } else {
      d = new Date(str)
    }
  }
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
