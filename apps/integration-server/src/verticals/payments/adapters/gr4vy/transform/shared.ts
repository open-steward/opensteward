/**
 * Helpers shared across Gr4vy transform files.
 *
 * Gr4vy represents money as integer minor units already (`amount: 1299` = USD
 * $12.99), so no float coercion is needed. Timestamps arrive as ISO 8601 with
 * an explicit offset (e.g. `2013-07-16T19:23:00.000+00:00`) but are normalised
 * through `toIsoDatetime` at every assignment to satisfy the strict canonical
 * `IsoDatetime` contract. The wire is snake_case; canonical TS is camelCase.
 */

/** Upper-case an ISO-4217 currency code, defaulting to `USD` when absent. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

/** Coerce an arbitrary value into a string map, dropping null/undefined. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = String(v)
  }
  return out
}

/** Narrow an arbitrary value to a trimmed non-empty string, else undefined. */
export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const t = v.trim()
    return t === '' ? undefined : t
  }
  if (v === null || v === undefined) return undefined
  return String(v)
}
