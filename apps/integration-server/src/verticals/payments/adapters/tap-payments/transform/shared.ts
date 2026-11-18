/**
 * Helpers shared across Tap Payments transform files.
 *
 * Tap represents money as a DECIMAL in major units (e.g. `100.000` AED,
 * `1.500` KWD), not integer minor units. The canonical schema stores integer
 * minor units, so every amount is multiplied by the currency's minor-unit
 * exponent before assignment. Most GCC currencies Tap settles in use 3
 * decimals (BHD, KWD, OMR); the rest use 2.
 *
 * Transforms never throw: missing/unparseable inputs collapse to undefined
 * (or 0 for the required `amount` field), matching the canonical contract.
 */

/** ISO 4217 currencies with 3 minor-unit decimals (the GCC fils currencies). */
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'KWD', 'OMR', 'TND', 'IQD', 'JOD', 'LYD'])
/** ISO 4217 currencies with 0 minor-unit decimals. */
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'CLP', 'VND', 'XOF', 'XAF', 'DJF'])

function minorUnitExponent(currency: string | null | undefined): number {
  const c = (currency ?? '').toUpperCase()
  if (THREE_DECIMAL_CURRENCIES.has(c)) return 3
  if (ZERO_DECIMAL_CURRENCIES.has(c)) return 0
  return 2
}

/** Default Tap settlement currency is AED unless the charge says otherwise. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'AED').toUpperCase()
}

/**
 * Convert a Tap decimal major-unit amount into integer minor units using the
 * currency's exponent. Returns 0 when the input is missing/unparseable.
 */
export function toMinorUnits(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
): number {
  if (amount == null || amount === '') return 0
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * Math.pow(10, minorUnitExponent(currency)))
}

/**
 * Convert a canonical integer minor-unit amount into a Tap decimal major-unit
 * amount using the currency's exponent. Returns undefined when the input is
 * null/undefined (so callers can omit the field entirely).
 */
export function toMajorUnits(
  amount: number | null | undefined,
  currency: string | null | undefined,
): number | undefined {
  if (amount == null) return undefined
  const exp = minorUnitExponent(currency)
  if (exp === 0) return amount
  // Use parseFloat+toFixed to avoid floating-point precision noise.
  return parseFloat((amount / Math.pow(10, exp)).toFixed(exp))
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
