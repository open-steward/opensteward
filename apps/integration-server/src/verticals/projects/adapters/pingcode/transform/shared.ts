export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  if (typeof v === 'object') return undefined
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
 * PingCode emits datetimes as 10-digit Unix timestamps (seconds), e.g.
 * `created_at: 1610000000`. Coerce to a strict ISO-8601 string. Tolerates
 * ms timestamps and ISO strings as a fallback so the transform never throws.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null || s === '') return undefined
  if (typeof s === 'number') {
    // < 1e12 → seconds; otherwise already milliseconds.
    const ms = s < 1e12 ? s * 1000 : s
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  const str = String(s)
  const asNum = Number(str)
  if (!Number.isNaN(asNum) && /^\d+$/.test(str)) {
    const ms = asNum < 1e12 ? asNum * 1000 : asNum
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}
