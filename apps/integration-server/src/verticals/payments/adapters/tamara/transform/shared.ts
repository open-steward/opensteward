/**
 * Helpers shared across Tamara transform files.
 *
 * Tamara represents money as a `{ amount, currency }` object where `amount`
 * is a decimal *major-unit* value (string or number), e.g.
 * `{ "amount": "100.00", "currency": "SAR" }`. The canonical payments schema
 * stores amounts as integer minor units, so `toMinorUnits` scales by the
 * currency exponent. Tamara settles in SAR/AED (2 decimals) and
 * BHD/KWD/OMR (3 decimals).
 */

import { toIsoDatetime } from '@opensteward/shared'

export { toIsoDatetime }

/** Tamara money object: `{ amount: "100.00", currency: "SAR" }`. */
export interface TamaraMoney {
  amount?: string | number
  currency?: string
}

/**
 * ISO 4217 minor-unit exponents that differ from the default of 2. Covers the
 * GCC currencies Tamara settles in (SAR/AED use 2; BHD/KWD/OMR use 3).
 */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  BHD: 3,
  KWD: 3,
  OMR: 3,
}

export function minorUnitExponent(currency: string | null | undefined): number {
  if (!currency) return 2
  return MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2
}

/**
 * Convert a Tamara decimal major-unit amount into integer minor units.
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

/** Read amount/currency from a Tamara money object, tolerating undefined. */
export function moneyFields(m: TamaraMoney | null | undefined): {
  amount: number
  currency: string | undefined
} {
  const currency = pickCurrency(m?.currency)
  return { amount: toMinorUnits(m?.amount, currency), currency }
}

export function pickCurrency(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined
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
