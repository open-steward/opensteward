/**
 * Helpers shared across BitPay transform files.
 *
 * BitPay expresses invoice/refund amounts as a **fiat major-unit number** in
 * the invoice's settlement currency (e.g. `price: 10` for USD 10.00), whereas
 * the canonical schema stores integer **minor units** (cents). We therefore
 * scale by the currency's minor-unit exponent before assigning `amount`.
 *
 * Timestamps arrive either as epoch milliseconds (`invoiceTime`,
 * `expirationTime`) or ISO-8601 strings (`requestDate`) — `toIsoDatetime`
 * normalises both to strict ISO-8601, returning undefined on anything it can't
 * parse (missing-rather-than-wrong).
 */

/**
 * ISO 4217 minor-unit exponents for the currencies that diverge from the
 * default of 2. BitPay settles in fiat, so this covers the practical set:
 * zero-decimal (JPY, KRW, …) and three-decimal (BHD, KWD, …) currencies.
 */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  // zero-decimal
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  MGA: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  // three-decimal
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
}

/** Number of minor units in one major unit for the given currency. */
function minorUnitFactor(currency: string): number {
  return Math.pow(10, MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2)
}

/**
 * Convert a fiat major-unit amount (BitPay `price` / refund `amount`) into the
 * canonical integer minor-unit representation for the given currency. Returns 0
 * when the input is missing or non-numeric (never throws).
 */
export function toMinorUnits(
  major: number | string | null | undefined,
  currency: string,
): number {
  const n = typeof major === 'string' ? Number(major) : major
  if (n == null || Number.isNaN(n)) return 0
  return Math.round(n * minorUnitFactor(currency))
}

/**
 * Convert a canonical integer minor-unit amount back into the fiat major-unit
 * number BitPay expects on write paths (e.g. a refund's `amount`). Returns
 * undefined when the input is missing (never throws).
 */
export function toMajorUnits(
  minor: number | null | undefined,
  currency: string,
): number | undefined {
  if (minor == null || Number.isNaN(minor)) return undefined
  return minor / minorUnitFactor(currency)
}

/** Uppercase the currency; BitPay always returns a 3-letter ISO 4217 code. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
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
