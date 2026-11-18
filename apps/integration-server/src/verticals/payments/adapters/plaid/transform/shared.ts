/**
 * Helpers shared across Plaid Transfer transform files.
 *
 * Plaid represents money as a decimal string in major units with two digits
 * of precision (e.g. `"12.34"` = 1234 cents). The canonical schema stores
 * integer minor units, so convert at the boundary. The currency rides
 * alongside as `iso_currency_code` (defaults to USD for ACH).
 *
 * Per the canonical-transform contract these helpers never throw — a missing
 * or malformed value collapses to `0` / `undefined` rather than blowing up.
 */

/** Decimal-string major units (`"12.34"`) → integer minor units (`1234`). */
export function decimalToMinor(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** ISO 4217, uppercased. Plaid ACH transfers settle in USD by default. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

/** Coerce an arbitrary object into a flat string→string map (drops nullish). */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}
