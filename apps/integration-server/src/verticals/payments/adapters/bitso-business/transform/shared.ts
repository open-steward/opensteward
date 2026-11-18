/**
 * Helpers shared across Bitso Business transform files.
 *
 * Bitso returns money as decimal *major-unit* strings (e.g. `"1.00000000"`,
 * `"57"`) and currency codes in lower case (`"mxn"`, `"usd"`, `"btc"`). The
 * canonical payments schema wants integer *minor* units and an ISO-4217-style
 * upper-case currency code, so every monetary field passes through
 * {@link toMinorUnits}.
 *
 * Minor-unit scaling is currency-dependent: fiat settles to 2 decimals, while
 * crypto carries up to 8. We keep a small lookup keyed by upper-case currency
 * and default to 2 (the fiat case the payments vertical cares about).
 */

/** Decimal places per currency when expressing the amount in minor units. */
const MINOR_UNIT_DECIMALS: Record<string, number> = {
  // Fiat (2 decimals)
  MXN: 2,
  USD: 2,
  ARS: 2,
  BRL: 2,
  COP: 2,
  EUR: 2,
  // Crypto / digital assets (8 decimals)
  BTC: 8,
  ETH: 8,
  XRP: 8,
  USDT: 8,
  USDC: 8,
  MANA: 8,
}

/** Upper-case + null-collapse a Bitso currency code. */
export function normalizeCurrency(v: string | null | undefined): string | undefined {
  if (v == null) return undefined
  const code = String(v).trim().toUpperCase()
  return code || undefined
}

/** Minor-unit decimal places for a (normalized) currency code; defaults to 2. */
export function minorUnitDecimals(currency: string | undefined): number {
  if (!currency) return 2
  return MINOR_UNIT_DECIMALS[currency] ?? 2
}

/**
 * Convert a Bitso decimal major-unit string into integer minor units for the
 * given currency, or `undefined` when the input is missing / unparseable.
 *
 * `"1.00000000"` + USD → 100; `"57"` + XRP → 5_700_000_000; `"12.34"` + MXN → 1234.
 * Computes in integer space (no float rounding) by shifting the decimal point.
 */
export function toMinorUnits(
  value: string | number | null | undefined,
  currency: string | undefined,
): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const raw = String(value).trim()
  if (!/^-?\d*\.?\d*$/.test(raw) || raw === '' || raw === '.' || raw === '-') return undefined
  const decimals = minorUnitDecimals(currency)
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [intPart = '0', fracPart = ''] = unsigned.split('.')
  const fracPadded = (fracPart + '0'.repeat(decimals)).slice(0, decimals)
  const digits = (intPart + fracPadded).replace(/^0+(?=\d)/, '')
  const minor = Number(digits || '0')
  if (!Number.isFinite(minor)) return undefined
  return negative ? -minor : minor
}

/** Coerce a mixed map into a flat `Record<string,string>` (drops null/undefined). */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}
