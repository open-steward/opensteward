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
  if (v === 1 || v === '1' || v === 'true' || v === 'S' || v === 's') return true
  if (v === 0 || v === '0' || v === 'false' || v === 'N' || v === 'n') return false
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
 * Convert any date-ish value to ISO 8601 string.
 * Tiny v3 dates are ISO 8601 strings (e.g. "2024-05-10T14:30:00-03:00") or
 * plain date strings ("2024-05-10"). Returns undefined on parse failure —
 * never throws.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/**
 * Convert a float BRL price (e.g. 49.90) to integer minor units (centavos).
 * Returns undefined if the value is nil.
 */
export function toMinorUnits(v: unknown): number | undefined {
  const n = pickNum(v)
  if (n === undefined) return undefined
  return Math.round(n * 100)
}
