/**
 * Moov transfer (sent to a recipient's bank account or card; see ../rails.ts)
 * → canonical Payout.
 *
 * Fields, as documented on https://docs.moov.io/api/money-movement/transfers/list/:
 *   transferID, createdOn, status, amount {currency, value}, failureReason,
 *   metadata, destination.paymentMethodType, destination.bankAccount
 *   .lastFourAccountNumber, destination.card.lastFourCardNumber ("Last four
 *   digits of the card number").
 *
 * Method (https://docs.moov.io/guides/money-movement/payment-methods/):
 *   "ach-credit-standard | Bank account | Credit a bank account (1-2 business
 *   days)" → standard; "instant-bank-credit … Real-time credit via RTP",
 *   "rtp-credit … Real-time credit via RTP", "push-to-card … Instant credit to a
 *   debit card", push-to-apple-pay / push-to-google-pay "Send a near real-time
 *   disbursement" → instant. "ach-credit-same-day … Credit a bank account (same
 *   day)" is neither, so the method is left unset.
 *
 * Status (https://docs.moov.io/guides/money-movement/events-and-statuses/):
 *   created / queued / pending → pending; completed → paid; failed → failed;
 *   canceled → cancelled. reversed ("The transfer completed, but funds were
 *   returned to the source") has no canonical payout equivalent → unknown; the
 *   Moov status stays in `raw`.
 *
 * `arrivalDate` is unset: Moov documents `completedOn` as a timestamp with no
 * description of when funds reach the recipient. No updated-at is documented.
 */
import type { Payout, PayoutMethod, PayoutStatus } from '../../../schema/payout'
import { requireMoovAmount, type RawMoovTransfer } from '../rails'

function mapStatus(status: string | undefined): PayoutStatus {
  switch (status) {
    case 'created':
    case 'queued':
    case 'pending':
      return 'pending'
    case 'completed':
      return 'paid'
    case 'failed':
      return 'failed'
    case 'canceled':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

const STANDARD_RAILS = new Set(['ach-credit-standard'])
const INSTANT_RAILS = new Set([
  'instant-bank-credit',
  'rtp-credit',
  'push-to-card',
  'push-to-apple-pay',
  'push-to-google-pay',
])
const BANK_RAILS = new Set([
  'ach-credit-standard',
  'ach-credit-same-day',
  'instant-bank-credit',
  'rtp-credit',
])

function mapMethod(rail: string | undefined): PayoutMethod | undefined {
  if (rail === undefined) return undefined
  if (STANDARD_RAILS.has(rail)) return 'standard'
  if (INSTANT_RAILS.has(rail)) return 'instant'
  return undefined
}

/** Last four of the recipient's bank account (bank rails) or card (push-to-card). */
function destinationLast4(raw: RawMoovTransfer): string | undefined {
  const rail = raw.destination?.paymentMethodType
  if (rail === undefined) return undefined
  if (BANK_RAILS.has(rail)) return raw.destination?.bankAccount?.lastFourAccountNumber
  if (rail === 'push-to-card') return raw.destination?.card?.lastFourCardNumber
  return undefined
}

export function transformPayout(raw: RawMoovTransfer): Payout {
  if (typeof raw.transferID !== 'string' || raw.transferID === '') {
    throw new Error('Moov transfer without transferID (ingestion error)')
  }
  const id = raw.transferID
  const { value, currency } = requireMoovAmount(raw.amount, `Moov transfer ${id}`)
  const payout: Payout = {
    id,
    externalId: id,
    amount: value,
    currency,
    status: mapStatus(raw.status),
    gateway: 'moov',
    metadata: { ...raw.metadata },
    raw,
  }
  const method = mapMethod(raw.destination?.paymentMethodType)
  if (method !== undefined) payout.method = method
  const last4 = destinationLast4(raw)
  if (last4 !== undefined) payout.destinationLast4 = last4
  if (raw.failureReason !== undefined) payout.failureCode = raw.failureReason
  if (raw.createdOn !== undefined) payout.createdAt = raw.createdOn
  return payout
}
