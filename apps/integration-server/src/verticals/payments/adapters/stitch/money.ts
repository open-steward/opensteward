/**
 * Stitch `Money` → canonical minor units.
 *
 * Money is `{ quantity, currency }` (MoneyInput: "quantity : Decimal !",
 * "currency : CurrencyCode !", https://docs.stitch.money/api/inputs/money-input).
 * "Decimal is a fixed precision signed numeric value encoded as a string.
 * Primarily designed for representing monetary values in a given currency."
 * (https://docs.stitch.money/api/scalars/decimal) — major units, as in the
 * documented example `"amount": { "currency": "ZAR", "quantity": "280.00" }`
 * (https://docs.stitch.money/payment-products/payins/paybybank/integration-process).
 */

import { majorToMinor } from '@opensteward/shared'

export interface RawStitchMoney {
  quantity: string | number
  currency: string
}

export function moneyToMinor(
  money: RawStitchMoney | null | undefined,
  what: string,
): {
  amount: number
  currency: string
} {
  const currency = typeof money?.currency === 'string' ? money.currency.toUpperCase() : ''
  const quantity = money?.quantity
  const major =
    typeof quantity === 'number' ? quantity : typeof quantity === 'string' ? Number(quantity) : NaN
  if (!currency || quantity === '' || !Number.isFinite(major)) {
    throw new Error(`Stitch ${what} has no documented amount { quantity, currency }`)
  }
  return { amount: majorToMinor(major, currency), currency }
}
