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
 * Convert any datetime value to a strict ISO-8601 string.
 * Zoho Sprints returns timestamps as epoch-millisecond numbers,
 * numeric strings (e.g. "1704067200000"), or ISO strings.
 * Returns undefined for missing/unparseable values.
 * Transforms NEVER throw.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  // Numeric type: treat directly as epoch ms
  if (typeof s === 'number') {
    if (!Number.isFinite(s)) return undefined
    return new Date(s).toISOString()
  }
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  // Numeric string (e.g. "1704067200000"): parse as epoch ms
  const n = Number(str)
  if (Number.isFinite(n) && str.trim() !== '') {
    return new Date(n).toISOString()
  }
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
