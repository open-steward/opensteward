import { toIsoDatetime } from '@opensteward/shared'

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
 * Coerce a Float timestamp into strict ISO-8601, or undefined.
 *
 * Float serializes datetimes as space-separated, timezone-less strings in
 * the account's local zone (e.g. `"2024-10-24 05:08:26"`) and plain dates as
 * `"2024-10-24"`. `toIsoDatetime` expects a `T` separator, so normalize the
 * space form first; empty strings and nulls return undefined.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = (typeof s === 'string' ? s : String(s)).trim()
  if (!str) return undefined
  return toIsoDatetime(str.replace(' ', 'T'))
}

/** Float booleans ride the wire as 1/0 (numbers) or true/false. */
export function isTruthy(v: unknown): boolean {
  return v === 1 || v === '1' || v === true
}

/** Normalize Float's `tags` field (array of strings, or `{name}` objects). */
export function tagNames(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const t of input) {
    if (typeof t === 'string' && t.length > 0) out.push(t)
    else if (t && typeof t === 'object') {
      const name = (t as { name?: unknown }).name
      if (typeof name === 'string' && name.length > 0) out.push(name)
    }
  }
  return out
}
