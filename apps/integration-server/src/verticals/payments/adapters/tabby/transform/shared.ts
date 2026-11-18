/**
 * Helpers shared across Tabby transform files.
 *
 * Unlike most gateways, Tabby represents money as a **decimal string** in the
 * major unit (e.g. `"330.00"`), not integer minor units — and the canonical
 * schema wants integer minor units. We convert with the currency's exponent:
 * AED/SAR use 2 decimals, KWD uses 3. Conversion goes via a string-shifted
 * integer parse (not `value * 100`) to dodge binary-float drift on amounts
 * like `0.07`.
 *
 * Tabby trades only in AED / SAR / KWD; we default to AED when a payload omits
 * the currency.
 */

/** Minor-unit exponent per Tabby-supported currency. */
const CURRENCY_EXPONENT: Record<string, number> = {
  AED: 2,
  SAR: 2,
  KWD: 3,
}

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'AED').toUpperCase()
}

function exponentFor(currency: string | null | undefined): number {
  return CURRENCY_EXPONENT[pickCurrency(currency)] ?? 2
}

/**
 * Convert a Tabby decimal-string amount (major units) to integer minor units
 * for the canonical schema. Returns `undefined` for a missing amount so
 * callers can decide on a fallback. Never throws.
 */
export function toMinorUnits(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
): number | undefined {
  if (amount == null || amount === '') return undefined
  const str = typeof amount === 'number' ? String(amount) : amount.trim()
  if (str === '') return undefined
  const exp = exponentFor(currency)
  const neg = str.startsWith('-')
  const unsigned = neg ? str.slice(1) : str
  const [whole = '0', frac = ''] = unsigned.split('.')
  const fracPadded = (frac + '0'.repeat(exp)).slice(0, exp)
  const digits = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, '')
  const n = Number(digits)
  if (!Number.isFinite(n)) return undefined
  return neg ? -n : n
}

/**
 * Convert canonical integer minor units back to the decimal-string major-unit
 * amount Tabby's request bodies expect (e.g. `33000` AED → `"330.00"`).
 */
export function toMajorString(
  minor: number | null | undefined,
  currency: string | null | undefined,
): string | undefined {
  if (minor == null || !Number.isFinite(minor)) return undefined
  const exp = exponentFor(currency)
  const neg = minor < 0
  const digits = String(Math.abs(Math.trunc(minor))).padStart(exp + 1, '0')
  const whole = digits.slice(0, digits.length - exp)
  const frac = exp > 0 ? `.${digits.slice(digits.length - exp)}` : ''
  return `${neg ? '-' : ''}${whole}${frac}`
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
