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
 * Convert any date-like value to strict ISO-8601 string.
 * Zoho BugTracker returns dates in formats like "MM-DD-YYYY" and epoch millis
 * for `*_time_long` fields; we accept both.
 * Returns undefined for missing / unparseable values — transforms must never throw.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  // Epoch milliseconds (long integer)
  if (typeof s === 'number' && s > 0) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  const str = typeof s === 'string' ? s.trim() : String(s)
  if (!str) return undefined
  // Try direct parse first
  let d = new Date(str)
  if (!Number.isNaN(d.getTime())) return d.toISOString()
  // Zoho sometimes returns MM-DD-YYYY
  const mmddyyyy = str.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (mmddyyyy) {
    d = new Date(`${mmddyyyy[3]}-${mmddyyyy[1]}-${mmddyyyy[2]}`)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return undefined
}
