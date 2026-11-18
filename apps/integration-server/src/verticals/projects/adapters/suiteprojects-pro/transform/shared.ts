/**
 * Shared transform utilities for the SuiteProjects Pro adapter.
 *
 * OpenAir REST API uses camelCase attribute names and two date formats:
 *   - string($date)      YYYY-MM-DD
 *   - string($date-time) YYYY-MM-DD hh:mm:ss  (read-only system fields)
 *
 * toIso() normalises both to strict ISO-8601 with a trailing Z.
 */

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  // Guard: never coerce objects/arrays — they stringify as "[object Object]"
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
 * Convert an OpenAir date or date-time string to ISO-8601.
 *
 * OpenAir date-time format is "YYYY-MM-DD hh:mm:ss" (space separator),
 * which the Date constructor does not parse reliably on all runtimes.
 * We normalise the space to 'T' and append 'Z' only when the string has no
 * timezone indicator (no trailing Z, no +HH:MM offset, no -HH:MM offset after
 * the time component).
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  // Guard: objects/arrays do not represent dates
  if (typeof s === 'object') return undefined
  let str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  // Normalise "YYYY-MM-DD hh:mm:ss" → "YYYY-MM-DDTHH:mm:ss"
  str = str.replace(' ', 'T')
  // Append UTC marker only when the string carries no timezone info.
  // Timezone indicators: trailing Z, or +HH:MM / -HH:MM after the time part
  // (position ≥ 11 guards against the date portion's hyphen separators).
  const hasOffset = str.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(str)
  if (!hasOffset) str += 'Z'
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
