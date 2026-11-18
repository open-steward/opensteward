/**
 * Helpers shared across Lago transform files.
 *
 * Lago represents money as integer minor units already, in `*_amount_cents`
 * fields, so no float coercion is needed. Currencies are 3-letter ISO 4217
 * codes; Lago always returns an explicit currency, so we uppercase but never
 * invent a default. Datetimes are ISO 8601 strings — normalise every one via
 * the shared `toIsoDatetime` at assignment time.
 *
 * Lago `metadata` ships as an array of `{ key, value }` objects (sometimes
 * with an extra `lago_id` / `display_in_invoice`), not a plain map, so the
 * map coercion handles both shapes. Transforms never throw — missing optionals
 * collapse to `undefined`.
 */

/** Uppercase a Lago currency code, or `undefined` when absent. */
export function pickCurrency(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  return v.toUpperCase()
}

interface LagoMetadataEntry {
  key?: unknown
  value?: unknown
}

/**
 * Coerce Lago `metadata` into the canonical `Record<string, string>`.
 * Accepts both the array-of-`{key,value}` form Lago returns and a plain
 * object, dropping null/empty keys and stringifying every value.
 */
export function strMap(input: unknown): Record<string, string> {
  if (!input) return {}
  const out: Record<string, string> = {}
  if (Array.isArray(input)) {
    for (const entry of input as LagoMetadataEntry[]) {
      if (!entry || typeof entry !== 'object') continue
      const key = entry.key
      if (key == null || String(key) === '') continue
      const value = entry.value
      if (value == null) continue
      out[String(key)] = typeof value === 'object' ? JSON.stringify(value) : String(value)
    }
    return out
  }
  if (typeof input !== 'object') return {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}
