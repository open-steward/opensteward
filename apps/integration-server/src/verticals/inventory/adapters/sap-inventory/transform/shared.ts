/** Shared transform helpers for the SAP S/4HANA inventory adapter. */

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
 * Convert any SAP date/datetime string to ISO 8601.
 *
 * SAP OData v2 returns dates as:
 *   - "/Date(1696118400000)/"        (milliseconds epoch, JSON)
 *   - "/Date(1696118400000+0000)/"   (with TZ offset, still epoch-based)
 *   - "2024-01-15T00:00:00"          (ISO-like, no timezone)
 *   - "20240115"                     (YYYYMMDD compact)
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined

  // SAP JSON Date — /Date(epoch)/ or /Date(epoch+0000)/
  const sapDate = /\/Date\((\d+)(?:[+-]\d{4})?\)\//.exec(str)
  if (sapDate) {
    const ms = parseInt(sapDate[1]!, 10)
    if (!Number.isNaN(ms)) return new Date(ms).toISOString()
  }

  // Compact YYYYMMDD
  if (/^\d{8}$/.test(str)) {
    const d = new Date(
      `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T00:00:00.000Z`,
    )
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }

  // General parse (ISO-like, already ISO, etc.)
  const d = new Date(str)
  if (!Number.isNaN(d.getTime())) return d.toISOString()
  return undefined
}
