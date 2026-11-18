export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
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

/** A timestamp that ends in `Z` or a `±hh:mm` offset. */
const ZONED = /(Z|[+-]\d{2}:?\d{2})$/i

/**
 * An ISO timestamp, or undefined when absent or unparseable.
 *
 * `utc`: the value is documented as UTC but may be written without a zone.
 * The Data Export API documents `date_created` as "Date and time the record
 * was created (UTC)" and its example is "2019-10-31T14:28:02", which
 * `new Date()` would read as local time.
 */
export function toIso(s: unknown, utc = false): string | undefined {
  if (typeof s !== 'string' || s === '') return undefined
  const text = utc && !ZONED.test(s) ? `${s}Z` : s
  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
