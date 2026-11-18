/**
 * The row the Data Services transaction search returns, and what the charge
 * and refund transforms share about it.
 *
 * Source: Payment API spec (https://developer.viva.com/downloads/payment-api.yaml),
 * definition `data_services_retrieve_transactions_response.data[]`. Only the
 * fields the transforms read are typed; everything else stays on `raw`.
 */

export interface RawVivaComTransaction {
  /** "The transaction’s unique ID." */
  TransactionId: string
  /** "The unique ID of the transaction type." */
  TransactionTypeId?: number | null
  /** "The order’s unique code." (int64) */
  OrderCode?: number | null
  /** "The customer’s email address." */
  Email?: string | null
  /** "An ID or a short description that helps you uniquely identify the transaction." */
  MerchantTrns?: string | null
  /** "A friendly description that is displayed to the customer." */
  CustomerTrns?: string | null
  /** "The date and time that the transaction took place." */
  InsDate?: string | null
  /** "The 3-digit currency code of the transaction as defined in ISO 4712" (integer, e.g. 978). */
  CurrencyCode?: number | null
  /** "The net amount of the transaction." (major units, e.g. 0.27) */
  Amount?: number | null
  /** "The transaction’s current status" — F, E, A, R, X, M, MA, MI, ML, MW, MS. */
  StatusId?: string | null
  /** "In case the transaction is considered to be consequent of another (e.g. … a refund), … the unique ID of the originating transaction." */
  ParentId?: string | null
  [key: string]: unknown
}

/**
 * Numeric → alphabetic currency codes, exactly the table Viva documents at
 * https://developer.viva.com/smart-checkout/smart-checkout-multicurrency/:
 * "Currency Currency Code in ISO EUR 978 GBP 826 RON 946 PLN 985 CZK 203 HUF 348 SEK 752 DKK 208".
 */
const CURRENCY_BY_NUMERIC: Record<number, string> = {
  978: 'EUR',
  826: 'GBP',
  946: 'RON',
  985: 'PLN',
  203: 'CZK',
  348: 'HUF',
  752: 'SEK',
  208: 'DKK',
}

/** The ISO 4217 alpha code for one of Viva's documented numeric codes, or undefined. */
export function currencyByNumeric(code: unknown): string | undefined {
  return typeof code === 'number' ? CURRENCY_BY_NUMERIC[code] : undefined
}

/** The row's ISO 4217 alpha code. Throws when the numeric code is absent or not one Viva documents. */
export function currencyOf(raw: RawVivaComTransaction): string {
  const code = raw.CurrencyCode
  const alpha = currencyByNumeric(code)
  if (!alpha) {
    throw new Error(
      `Viva.com transaction ${raw.TransactionId} has CurrencyCode ${String(code)}, not one of Viva's documented currencies`,
    )
  }
  return alpha
}

/**
 * TransactionTypeId values that take a payment, from the TransactionTypeId
 * table at https://developer.viva.com/integration-reference/response-codes/
 * ("0 Card Capture … 5 Card Charge … 6 Card Charge (installments) … 9 Wallet
 * Charge …"). Pre-authorisations (1, 80) are left out: their capture is a
 * separate transaction (0, 81). Rows the page hides (42 BitPay, 58 Payconiq)
 * are left out.
 */
export const CHARGE_TYPE_IDS: readonly number[] = [
  0, 5, 6, 9, 15, 16, 20, 23, 25, 27, 29, 32, 34, 36, 38, 40, 44, 48, 50, 52, 54, 56, 60, 62, 64,
  66, 68, 70, 72, 74, 76, 78, 81, 88,
]

/**
 * TransactionTypeId values the same table names a refund ("4 Card Refund",
 * "11 Wallet Refund", "17 Cash Refund", …). "Refund Claimed" types (13, 46,
 * 83, 90) are chargebacks, and 8 "Card Original Credit" is a credit, not a
 * refund of a charge; both are left out, as is the hidden 59 Payconiq Refund.
 */
export const REFUND_TYPE_IDS: readonly number[] = [
  4, 11, 17, 18, 21, 24, 26, 28, 30, 35, 37, 39, 41, 45, 49, 51, 53, 55, 57, 61, 63, 65, 67, 71, 73,
  75, 77, 79, 85, 89,
]
