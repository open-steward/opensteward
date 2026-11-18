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

export function pickBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (v === 1 || v === '1' || v === 'true' || v === 'Y') return true
  if (v === 0 || v === '0' || v === 'false' || v === 'N') return false
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
 * Unicommerce returns epoch millis (number) as well as ISO strings.
 * Returns undefined for null/undefined/invalid values.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  // Unicommerce sometimes sends epoch millis as a number
  if (typeof s === 'number') {
    if (s === 0) return undefined
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
    return undefined
  }
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
