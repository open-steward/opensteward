/**
 * Helpers shared across Scalapay transform files.
 *
 * Unlike most gateways (which use integer minor units), Scalapay represents
 * money as a decimal *major-unit* string on a `{ amount, currency }` object — e.g.
 * `{ "amount": "100.00", "currency": "EUR" }`. The canonical payments schema
 * stores amounts as integer minor units, so `toMinorUnits` parses the decimal
 * string and scales it by the currency exponent.
 */

import { toIsoDatetime } from '@opensteward/shared'

export { toIsoDatetime }

/** Scalapay money object: `{ amount: "100.00", currency: "EUR" }`. */
export interface ScalapayMoney {
  amount?: string | number
  currency?: string
}

/**
 * ISO 4217 minor-unit exponents that differ from the default of 2. Covers the
 * markets Scalapay settles in (EUR/GBP/AUD use 2; JPY uses 0). Anything not
 * listed falls back to 2.
 */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  ISK: 0,
  CLP: 0,
  VND: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
}

export function minorUnitExponent(currency: string | null | undefined): number {
  if (!currency) return 2
  return MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2
}

/**
 * Convert a Scalapay decimal major-unit amount into integer minor units.
 * Returns 0 when the input is missing/unparseable (canonical `amount` is a
 * required non-negative integer, so we must never emit `undefined` here).
 */
export function toMinorUnits(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
): number {
  if (amount === null || amount === undefined || amount === '') return 0
  const value = typeof amount === 'number' ? amount : Number(String(amount).trim())
  if (!Number.isFinite(value)) return 0
  const factor = Math.pow(10, minorUnitExponent(currency))
  return Math.round(value * factor)
}

export function pickCurrency(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  return v.toUpperCase()
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}
