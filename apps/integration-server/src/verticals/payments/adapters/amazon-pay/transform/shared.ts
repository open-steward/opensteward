/**
 * Helpers shared across Amazon Pay transform files.
 *
 * Amazon Pay represents money as a `{ amount: string, currencyCode: string }`
 * Price object where `amount` is a DECIMAL STRING (e.g. "14.00", "1250") — not
 * integer minor units. The canonical payments schema uses integer minor units,
 * so every amount is converted with `toMinorUnits` using the currency's ISO
 * 4217 exponent. Timestamps are ISO-8601 dateTime strings, normalised via the
 * shared `toIsoDatetime`.
 */

/** Amazon Pay Price object. */
export interface AmazonPayPrice {
  amount?: string
  currencyCode?: string
}

/**
 * ISO 4217 minor-unit exponents that are NOT 2. Anything not listed defaults
 * to 2 (the overwhelming majority). Covers the currencies Amazon Pay settles.
 */
const CURRENCY_EXPONENTS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  HUF: 2, // listed explicitly only where it differs from the default
  ISK: 0,
  CLP: 0,
  VND: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
}

function exponentFor(currency: string | undefined): number {
  if (!currency) return 2
  const code = currency.toUpperCase()
  return code in CURRENCY_EXPONENTS ? CURRENCY_EXPONENTS[code] : 2
}

/**
 * Convert a decimal-string amount into integer minor units for the given
 * currency. Returns `undefined` when the input can't be parsed (missing
 * rather than wrong — never throws).
 */
export function toMinorUnits(
  amount: string | number | null | undefined,
  currency: string | undefined,
): number | undefined {
  if (amount === null || amount === undefined || amount === '') return undefined
  const value = typeof amount === 'number' ? amount : Number(String(amount).trim())
  if (!Number.isFinite(value)) return undefined
  return Math.round(value * Math.pow(10, exponentFor(currency)))
}

/** Minor units from an Amazon Pay Price object. */
export function priceMinorUnits(price: AmazonPayPrice | null | undefined): number | undefined {
  if (!price) return undefined
  return toMinorUnits(price.amount, price.currencyCode)
}

/** ISO 4217 currency code from a Price object (uppercased), defaulting to USD. */
export function priceCurrency(price: AmazonPayPrice | null | undefined): string {
  return (price?.currencyCode ?? 'USD').toUpperCase()
}

/** Flatten an arbitrary object into a string→string metadata map. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') {
      out[k] = JSON.stringify(v)
    } else {
      out[k] = String(v)
    }
  }
  return out
}
