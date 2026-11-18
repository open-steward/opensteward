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
 * Convert a value to a strict ISO-8601 string.
 * Accepts ISO strings, epoch numbers (ms), or epoch strings.
 * Returns undefined for null/undefined/unparseable values.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  // Numeric epoch (seconds or ms) — InvGate defaults to epoch seconds
  if (typeof s === 'number') {
    if (Number.isNaN(s)) return undefined
    // Heuristic: values < 1e10 are seconds, >= 1e10 are ms
    const ms = s < 1e10 ? s * 1000 : s
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  // Try parsing as number string (epoch)
  const asNum = Number(str)
  if (!Number.isNaN(asNum) && str.trim() !== '') {
    const ms = asNum < 1e10 ? asNum * 1000 : asNum
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
