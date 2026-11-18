import { minorUnitExponent } from '@opensteward/shared'
import { fromMinorUnits, toMinorUnits } from '../shared/transform'

/**
 * `MonetaryAmount` / `RoundedMonetaryAmount` in Rillet's OpenAPI components
 * (https://docs.api.rillet.com/reference/list-all-bills-1.md): `amount` is a
 * "Monetary amount in decimal format, using a period (.) as the decimal
 * separator", `currency` an ISO-4217 code. Both are required.
 */
export interface RilletMonetaryAmount {
  amount: string
  currency: string
}

/**
 * A Rillet amount in canonical integer minor units, scaled by its own
 * currency's exponent: "1000" JPY is 1000, "1.500" KWD is 1500, "12.50" USD is
 * 1250. Every Rillet amount carries its currency, so the exponent is never
 * assumed.
 */
export function rilletAmountToMinor(
  money: Partial<RilletMonetaryAmount> | null | undefined,
): number | undefined {
  return toMinorUnits(money?.amount, money?.currency)
}

/**
 * The inverse, for write paths. Request amounts are `RoundedMonetaryAmount`,
 * which "must be rounded to the currency's default decimal places", so the
 * decimal string has exactly the currency's exponent: 1000 JPY is "1000",
 * 1500 KWD is "1.500", 1250 USD is "12.50".
 */
export function minorToRilletAmount(
  minor: number | null | undefined,
  currency: string,
): RilletMonetaryAmount | undefined {
  const major = fromMinorUnits(minor, currency)
  if (major === undefined) return undefined
  return { amount: major.toFixed(minorUnitExponent(currency)), currency }
}
