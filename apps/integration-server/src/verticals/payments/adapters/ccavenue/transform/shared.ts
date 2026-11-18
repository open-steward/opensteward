/**
 * Helpers shared across CCAvenue transform files.
 *
 * CCAvenue quotes amounts as DECIMAL major units (e.g. `order_amt: 1.0` is
 * ₹1.00, `order_amt: 1499.5` is ₹1499.50) — unlike gateways that quote
 * integer minor units. The canonical schema expects integer minor units, so
 * every amount is multiplied by 100 and rounded. Currencies arrive as
 * ISO-4217 codes (INR, USD, …) but the response key is the upstream's own
 * misspelling `order_currncy`.
 */

/** Convert a CCAvenue decimal major-unit amount to integer minor units. */
export function toMinorUnits(major: number | string | null | undefined): number {
  if (major === null || major === undefined || major === '') return 0
  const n = typeof major === 'number' ? major : Number(major)
  if (Number.isNaN(n)) return 0
  return Math.round(n * 100)
}

/** Normalise a currency code to an upper-case ISO-4217 string (default INR). */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'INR').toUpperCase()
}

/** Coerce an arbitrary value into a non-empty string, or undefined. */
export function pickStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}

/** Build a string→string metadata map, dropping null/undefined/empty values. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    const s = String(v)
    if (s === '') continue
    out[k] = s
  }
  return out
}
