/**
 * Helpers shared across Salt Edge transform files.
 *
 * Salt Edge returns transaction `amount` as a decimal major-unit value
 * (e.g. -10.99) and `currency_code` as ISO-4217. The canonical `Charge`
 * schema stores money in integer minor units, so we scale by the currency's
 * exponent (most are 2dp; JPY/KRW are 0dp). Datetimes are normalised to
 * strict ISO-8601 by the schema layer's `toIsoDatetime` helper.
 */

/** ISO-4217 currencies with a non-2 minor-unit exponent we are likely to see. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'CLP', 'ISK', 'VND', 'XOF', 'XAF', 'PYG'])
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'TND', 'JOD', 'IQD', 'LYD'])

export function minorUnitExponent(currency: string | null | undefined): number {
  const c = (currency ?? '').toUpperCase()
  if (ZERO_DECIMAL.has(c)) return 0
  if (THREE_DECIMAL.has(c)) return 3
  return 2
}

/** Convert a Salt Edge decimal major-unit amount to integer minor units. */
export function toMinorUnits(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
): number {
  const value = typeof amount === 'string' ? Number(amount) : amount
  if (value == null || Number.isNaN(value)) return 0
  return Math.round(value * Math.pow(10, minorUnitExponent(currency)))
}

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? '').toUpperCase()
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}
