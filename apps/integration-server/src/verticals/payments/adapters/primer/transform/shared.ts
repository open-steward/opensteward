/**
 * Helpers shared across the Primer transform files.
 *
 * Primer represents money in integer **minor units** already — `amount: 700`
 * means $7.00 — which matches the canonical payments schema, so no scaling is
 * needed. Currency arrives as a 3-letter ISO 4217 `currencyCode`.
 */

/**
 * Primer returns `currencyCode` as a 3-letter ISO 4217 code (USD, EUR, GBP…).
 * There is no single default currency, so fall back to USD only when absent.
 */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

/**
 * Coerce an arbitrary object into the canonical `Record<string, string>`
 * metadata map: stringify objects, drop nulls, never throw.
 */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}
