/**
 * Helpers shared across 2Checkout (Verifone) transform files.
 *
 * 2Checkout represents money as a *major-unit decimal* — a number or string
 * like `9.99` paired with an ISO-4217 `Currency` (e.g. `"USD"`). The canonical
 * payments schema stores integer minor units, so `toMinorUnits` multiplies by
 * the currency's exponent (2 for most; 0 for zero-decimal currencies like JPY,
 * KRW; 3 for the rare BHD/KWD/OMR/TND) and rounds.
 *
 * Transforms never throw: missing / unparseable inputs collapse to `undefined`
 * (or `0` where the canonical field is required and non-nullable).
 */

/** Currencies with no minor unit (amount === major unit). */
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF',
  'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
])
/** Currencies whose minor unit is 1/1000 (three decimal places). */
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

function exponentFor(currency: string | null | undefined): number {
  const code = (currency ?? '').toUpperCase()
  if (ZERO_DECIMAL.has(code)) return 0
  if (THREE_DECIMAL.has(code)) return 3
  return 2
}

/** Default to USD — 2Checkout settles globally but quotes USD by default. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

/**
 * Convert a 2Checkout major-unit decimal amount to canonical integer minor
 * units. Returns `undefined` for missing/unparseable input.
 */
export function toMinorUnits(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
): number | undefined {
  if (amount === null || amount === undefined || amount === '') return undefined
  const major = typeof amount === 'number' ? amount : Number(String(amount).trim())
  if (!Number.isFinite(major)) return undefined
  return Math.round(major * 10 ** exponentFor(currency))
}

/**
 * Convert canonical integer minor units back to the 2Checkout major-unit
 * decimal the wire expects (e.g. `1099` + `USD` → `10.99`, `1099` + `JPY` →
 * `1099`).
 */
export function fromMinorUnits(minor: number, currency: string | null | undefined): number {
  const exponent = exponentFor(currency)
  return Number((minor / 10 ** exponent).toFixed(exponent))
}

/** Coerce an arbitrary value into a string map, dropping null/undefined entries. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

/** Narrow an unknown to a non-empty string, or undefined. */
export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v.length ? v : undefined
  if (v === null || v === undefined) return undefined
  const s = String(v)
  return s.length ? s : undefined
}
