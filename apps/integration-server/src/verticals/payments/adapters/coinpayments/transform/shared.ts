/**
 * Helpers shared across CoinPayments transform files.
 *
 * CoinPayments v2 expresses money as a nested amount object — for an invoice,
 * `amount.total` carries both a `value` (integer *minor* units as a string,
 * e.g. `"125000"`) and a `displayValue` (decimal *major* units, e.g. `"1250.00"`)
 * keyed by a `currencyId`. The canonical payments schema wants integer minor
 * units and an upper-case currency code, so monetary fields prefer the
 * already-minor `value` and fall back to scaling `displayValue` via
 * {@link toMinorUnits}.
 *
 * Currency codes come back as ticker symbols (`"BTC"`, `"USDT"`, `"USD"`); we
 * upper-case them but otherwise leave them intact (`raw` preserves the original
 * `currencyId`). Transforms never throw — missing optionals collapse to
 * `undefined`.
 */

/** Decimal places per currency when expressing the amount in minor units. */
const MINOR_UNIT_DECIMALS: Record<string, number> = {
  // Fiat (2 decimals)
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  JPY: 0,
  // Crypto / digital assets (8 decimals — CoinPayments' common scale)
  BTC: 8,
  LTC: 8,
  ETH: 8,
  BCH: 8,
  DOGE: 8,
  XRP: 8,
  USDT: 8,
  USDC: 8,
  DAI: 8,
  TRX: 8,
}

/** Upper-case + null-collapse a CoinPayments currency code / ticker symbol. */
export function normalizeCurrency(v: string | number | null | undefined): string | undefined {
  if (v == null) return undefined
  const code = String(v).trim().toUpperCase()
  return code || undefined
}

/** Minor-unit decimal places for a (normalized) currency code; defaults to 8. */
export function minorUnitDecimals(currency: string | undefined): number {
  if (!currency) return 8
  return MINOR_UNIT_DECIMALS[currency] ?? 8
}

/**
 * Convert a decimal major-unit string into integer minor units for the given
 * currency, or `undefined` when the input is missing / unparseable.
 *
 * `"1250.00"` + USD → 125000; `"0.00100000"` + BTC → 100000; `"57"` + XRP →
 * 5_700_000_000. Computes in integer space (no float rounding) by shifting the
 * decimal point.
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

/**
 * Parse an integer-minor-unit string CoinPayments already emits (the `value`
 * field). Returns `undefined` when missing / non-integer so callers can fall
 * back to scaling `displayValue`.
 */
export function parseMinorUnits(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const raw = String(value).trim()
  if (!/^-?\d+$/.test(raw)) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

/** CoinPayments amount slot — both the minor-unit `value` and decimal `displayValue`. */
export interface CoinpaymentsAmountSlot {
  currencyId?: string | number
  value?: string | number
  displayValue?: string | number
  [k: string]: unknown
}

/**
 * Resolve a CoinPayments amount slot to `{ amount, currency }`. Prefers the
 * already-minor `value`; falls back to scaling `displayValue` by the currency's
 * decimal places.
 */
export function resolveAmount(
  slot: CoinpaymentsAmountSlot | null | undefined,
  fallbackCurrency?: string | null,
): { amount: number; currency: string } {
  const currency = normalizeCurrency(slot?.currencyId ?? fallbackCurrency) ?? 'USD'
  const minor = parseMinorUnits(slot?.value) ?? toMinorUnits(slot?.displayValue, currency)
  return { amount: minor ?? 0, currency }
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
