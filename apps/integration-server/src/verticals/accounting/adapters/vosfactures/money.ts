/**
 * VosFactures amounts → canonical integer minor units.
 *
 * The VosFactures API README (https://github.com/vosfactures/API, "Liste des
 * champs principaux") gives every amount as a major-unit decimal in the
 * document's `currency` ("currency" : "EUR" - devise), and writes its examples
 * both ways: with a decimal comma (`"paid" : "0,00"`, `"price_net" : "59,00"`,
 * `"price_gross": "20,00"`) and with a decimal point (`"price_net": "23.0"`,
 * `"total_price_gross": 10.23`). Both are read here. `parseFloat` alone would
 * read "72,57" as 72, so a comma is accepted as the separator when it is the
 * only one in the value; anything else that is not a plain number (a
 * thousands separator, "disabled") is left out rather than guessed at.
 *
 * Scaling goes through the shared currency-aware `toMinorUnits` /
 * `fromMinorUnits`, so 1000 JPY stays 1000 and 1.500 KWD becomes 1500.
 */
import { fromMinorUnits, toMinorUnits } from '../shared/transform'

const DECIMAL = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/

/** A VosFactures decimal (number, "12.50" or "12,50") as a number, else undefined. */
export function parseVosFacturesDecimal(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!DECIMAL.test(trimmed)) return undefined
  const n = Number(trimmed.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

/** A VosFactures amount in integer minor units of `currency`. */
export function vosfacturesToMinor(
  value: unknown,
  currency: string | null | undefined,
): number | undefined {
  return toMinorUnits(parseVosFacturesDecimal(value), currency)
}

/** Integer minor units back to the major-unit decimal VosFactures takes on write. */
export function minorToVosFactures(
  minor: number | null | undefined,
  currency: string | null | undefined,
): number | undefined {
  return fromMinorUnits(minor, currency)
}

/**
 * Header amounts of a billing document, in minor units of its `currency`.
 *
 * Each is read from a field the README documents on billing documents:
 *
 *   - `price_gross`: "total TTC" (the `order=` sort keys under "Paramètres
 *     additionnels des téléchargements");
 *   - `price_tax`: "total de Taxe" (same list);
 *   - `paid`: "montant payé" ("Liste des champs principaux").
 *
 * The README documents no remaining-balance field, so `balanceAmount` is
 * `price_gross − paid` when both are present. The adapter used to read
 * `tax`, `price_paid` and `remaining_price` here; none of the three is a
 * documented document-level field (`tax` is documented only on `positions`,
 * as a rate: "% de taxe").
 */
export interface DocumentAmounts {
  totalAmount: number | undefined
  taxAmount: number | undefined
  paidAmount: number | undefined
  balanceAmount: number | undefined
}

export function documentAmounts(
  raw: { price_gross?: unknown; price_tax?: unknown; paid?: unknown },
  currency: string | null | undefined,
): DocumentAmounts {
  const totalAmount = vosfacturesToMinor(raw.price_gross, currency)
  const taxAmount = vosfacturesToMinor(raw.price_tax, currency)
  const paidAmount = vosfacturesToMinor(raw.paid, currency)
  const balanceAmount =
    totalAmount !== undefined && paidAmount !== undefined ? totalAmount - paidAmount : undefined
  return { totalAmount, taxAmount, paidAmount, balanceAmount }
}

/**
 * `positions[].quantity` ("quantité"; a decimal, "kg" is a documented unit) as
 * the canonical integer quantity. A fractional quantity is left out rather
 * than rounded: 1.5 kg reported as 2 would misstate the line.
 */
export function positionQuantity(value: unknown): number | undefined {
  const n = parseVosFacturesDecimal(value)
  return n !== undefined && Number.isInteger(n) ? n : undefined
}
