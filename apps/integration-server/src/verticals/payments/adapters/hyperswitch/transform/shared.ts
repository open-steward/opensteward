/**
 * Helpers shared across Hyperswitch transform files.
 *
 * Hyperswitch represents money as integer minor units (the "lowest currency
 * denomination"), so no float coercion is needed. Currency codes arrive as
 * uppercase ISO 4217 strings. Timestamps are ISO 8601 strings, normalised via
 * `toIsoDatetime` at every assignment.
 */

/** Coerce an arbitrary value into a string `metadata` map, dropping nulls. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'string' ? v : String(v)
  }
  return out
}

/** Normalise an ISO 4217 currency code to uppercase, defaulting to USD. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}
