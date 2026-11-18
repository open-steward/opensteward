/** Shared field-coercion helpers for the SAP EWM adapter. */

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
  // SAP uses 'X' for true and '' (empty string) for false in boolean-like fields
  if (v === 1 || v === '1' || v === 'true' || v === 'X') return true
  if (v === 0 || v === '0' || v === 'false' || v === '') return false
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
 * Convert an SAP date/datetime value to an ISO 8601 string.
 *
 * SAP OData v2 serialises dates as:
 *   - "/Date(1704067200000)/"  — milliseconds since Unix epoch
 *   - "2024-01-01T00:00:00"   — ISO-ish without timezone
 *   - "20240101"              — compact YYYYMMDD
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = typeof s === 'string' ? s : String(s)
  if (!str || str === 'null') return undefined

  // SAP /Date(ms)/ format
  const sapDate = str.match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/)
  if (sapDate) {
    const ms = parseInt(sapDate[1]!, 10)
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }

  // Compact YYYYMMDD
  const compact = str.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) {
    const d = new Date(`${compact[1]}-${compact[2]}-${compact[3]}T00:00:00Z`)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }

  // Standard ISO or anything Date can parse
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/** Coerce a SAP quantity value to a number (quantities are plain counts, not minor units). */
export function pickQty(v: unknown): number {
  return pickNum(v) ?? 0
}
