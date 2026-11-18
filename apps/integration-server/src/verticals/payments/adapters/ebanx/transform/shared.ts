/**
 * EBANX returns money as decimal strings in the major unit (e.g.
 * `amount_ext: "100.00"`, `currency_ext: "USD"`) — NOT minor units like
 * Stripe/Paystack. The canonical schema wants an integer count of minor
 * units, so we multiply by the currency's exponent and round.
 *
 * EBANX settles a handful of Latin American + emerging-market currencies.
 * BRL is the default when the wire omits a currency. The currencies EBANX
 * actually supports are all 2-decimal, so a flat ×100 is correct; we keep a
 * tiny exponent table for the rare zero-decimal cases for safety.
 */
const ZERO_DECIMAL = new Set(['CLP', 'PYG'])

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'BRL').toUpperCase()
}

/** Decimal-major-unit string/number → integer minor units. */
export function toMinorUnits(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
): number {
  if (amount == null || amount === '') return 0
  const value = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(value)) return 0
  const exponent = ZERO_DECIMAL.has((currency ?? 'BRL').toUpperCase()) ? 0 : 2
  return Math.round(value * 10 ** exponent)
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}
