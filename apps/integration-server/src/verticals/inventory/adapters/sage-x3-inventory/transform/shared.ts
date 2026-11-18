/** Shared field-picking utilities for Sage X3 transforms. */

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
  // Sage X3 uses numeric 1/0 and string 'Y'/'N' for booleans
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
 * Parse a Sage X3 date value to ISO-8601 string.
 *
 * Sage X3 dates come back in various formats depending on representation:
 *   - ISO-8601:  "2024-03-15T10:00:00"
 *   - SData date: "2024-03-15"
 *   - Sage internal: "20240315" (YYYYMMDD)
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined

  // Handle Sage internal YYYYMMDD format
  if (/^\d{8}$/.test(str)) {
    const d = new Date(`${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }

  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/**
 * Convert a Sage X3 monetary amount to integer minor units (cents).
 * Sage stores amounts as decimals (e.g. 10.50 USD = 1050 cents).
 * Returns undefined if the value cannot be parsed.
 */
export function toMinorUnits(v: unknown): number | undefined {
  const n = pickNum(v)
  if (n === undefined) return undefined
  return Math.round(n * 100)
}
