/**
 * Helpers shared across the LegalDesk transform files.
 *
 * LegalDesk's Aadhaar eSign gateway returns timestamps as ISO-8601 strings
 * (and occasionally epoch seconds/millis on status payloads). Canonical
 * datetimes are strict ISO-8601, so `toIsoDatetime` normalises every shape
 * the gateway emits and returns `undefined` when a value is missing or
 * unparseable — transforms never throw on a bad optional.
 */

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return undefined
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

/** Flatten an object into a string→string map; drops nullish + nested values. */
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
 * Coerce any LegalDesk timestamp (ISO-8601 string, epoch seconds, or epoch
 * millis) to a strict ISO-8601 datetime. Returns `undefined` for missing or
 * unparseable values.
 */
export function toIsoDatetime(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') {
    // Heuristic: < 10^12 ⇒ epoch seconds; otherwise epoch millis.
    const ms = v < 1_000_000_000_000 ? v * 1000 : v
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  const str = pickStr(v)
  if (!str) return undefined
  // Bare epoch delivered as a string.
  if (/^\d{10,13}$/.test(str)) return toIsoDatetime(Number(str))
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}
