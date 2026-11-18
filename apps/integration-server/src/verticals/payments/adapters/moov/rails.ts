/**
 * Which Moov transfers are charges and which are payouts.
 *
 * Moov has one money-movement resource, the transfer. Each side carries a
 * `paymentMethodType`, documented as "The payment method type that represents
 * a payment rail and directionality"
 * (https://docs.moov.io/api/money-movement/transfers/list/). The rail is what
 * decides the canonical resource:
 *
 * CHARGE: money collected from a payer, identified by the SOURCE rail.
 *   https://docs.moov.io/guides/money-movement/payment-methods/
 *     "card-payment | Card | Charge a credit or debit card"
 *     "ach-debit-collect | Verified bank account | Debit a bank account for a
 *      consumer or B2B payment"
 *     "Collecting funds: The destination account pulls from a payment method
 *      owned by the source (payer)."
 *   https://docs.moov.io/guides/sources/apple-pay/ and /google-pay/
 *     "apple-pay | Payment | Accept a card payment from a payer using Apple Pay."
 *     "google-pay | Payment | Accept a card payment from a payer using Google Pay"
 *
 * PAYOUT: money sent from a wallet to a recipient's bank account or card,
 * identified by the DESTINATION rail.
 *   https://docs.moov.io/guides/money-movement/payment-methods/
 *     "A business sending a payout via ach-credit-same-day pushes funds to the
 *      recipient’s bank account."
 *     "ach-credit-standard | Bank account | Credit a bank account (1-2 business days)"
 *     "ach-credit-same-day | Bank account | Credit a bank account (same day)"
 *     "instant-bank-credit | Bank account | Real-time credit via RTP"
 *     "rtp-credit | Bank account | Real-time credit via RTP"
 *     "push-to-card | Debit/prepaid card | Instant credit to a debit card"
 *   https://docs.moov.io/guides/sources/apple-pay/ and /google-pay/
 *     "push-to-apple-pay | Payout (OCT) | Send a near real-time disbursement to
 *      a recipient's card via Apple Pay."  (and push-to-google-pay likewise)
 *
 * NEITHER (served by no method):
 *   "ach-debit-fund: Represents a "funding" flow (for example, topping up your
 *    own Moov wallet for a disbursement)"
 *    (https://docs.moov.io/guides/money-movement/accept-payments/ach/ach-overview/);
 *   "pull-from-apple-pay | Funding (AFT) | Pull funds from a debit or prepaid
 *    card on file in Apple Pay for approved use cases." (pull-from-google-pay
 *    likewise). pull-from-card is left out with them: the payment-methods
 *    guide lists it under "Collecting funds" but the wallet guides label the
 *    pull (AFT) rails as funding, so the docs do not settle it either way;
 *   wallet → wallet (moov-wallet on both sides);
 *   card-present-payment, which appears in the enum but in no guide that says
 *   what it is used for.
 *
 * The rail decides, not which side of the transfer the connected account is
 * on. The list is documented only as "List all the transfers associated with a
 * particular Moov account", with an `accountIDs` filter "based on whether the
 * account ID is the source or destination", so a row need not have the
 * connected account on either side, and a side check could drop every row of
 * a platform (partner) account.
 */

/** Documented Transfer fields the transforms read (v2026.07.00). */
export interface RawMoovAmount {
  currency?: string
  value?: number
}

export interface RawMoovTransferSide {
  paymentMethodID?: string
  paymentMethodType?: string
  account?: { accountID?: string; email?: string; displayName?: string }
  bankAccount?: { lastFourAccountNumber?: string }
  card?: { lastFourCardNumber?: string }
  [key: string]: unknown
}

export interface RawMoovTransfer {
  transferID?: string
  createdOn?: string
  completedOn?: string
  status?: string
  failureReason?: string
  amount?: RawMoovAmount
  description?: string
  metadata?: Record<string, string>
  source?: RawMoovTransferSide
  destination?: RawMoovTransferSide
  invoiceID?: string
  refundedAmount?: RawMoovAmount
  refunds?: Array<{ refundID?: string }>
  disputes?: Array<{ disputeID?: string }>
  [key: string]: unknown
}

export const CHARGE_SOURCE_RAILS: ReadonlySet<string> = new Set([
  'card-payment',
  'apple-pay',
  'google-pay',
  'ach-debit-collect',
])

export const PAYOUT_DESTINATION_RAILS: ReadonlySet<string> = new Set([
  'ach-credit-standard',
  'ach-credit-same-day',
  'instant-bank-credit',
  'rtp-credit',
  'push-to-card',
  'push-to-apple-pay',
  'push-to-google-pay',
])

export function isCharge(raw: RawMoovTransfer): boolean {
  const rail = raw.source?.paymentMethodType
  return typeof rail === 'string' && CHARGE_SOURCE_RAILS.has(rail)
}

export function isPayout(raw: RawMoovTransfer): boolean {
  const rail = raw.destination?.paymentMethodType
  return typeof rail === 'string' && PAYOUT_DESTINATION_RAILS.has(rail)
}

/**
 * Moov `Amount`: "currency string required … A 3-letter ISO 4217 currency code."
 * and "value integer<int64> required Quantity in the smallest unit of the
 * specified currency. In USD this is cents, for example, $12.04 is 1204"
 * (https://docs.moov.io/api/money-movement/transfers/list/). Both are required,
 * so a missing one is an ingestion error, never a zero or a default currency.
 */
export function requireMoovAmount(
  amount: RawMoovAmount | undefined,
  what: string,
): { value: number; currency: string } {
  const value = amount?.value
  const currency = amount?.currency
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${what}: missing required amount.value from Moov (ingestion error)`)
  }
  if (typeof currency !== 'string' || currency === '') {
    throw new Error(`${what}: missing required amount.currency from Moov (ingestion error)`)
  }
  return { value, currency }
}
