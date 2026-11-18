/**
 * Tink settlement-account SWEEP transaction → canonical Payout.
 *
 * SWEEP: "A scheduled payout to Merchant corporate account." The guide:
 * "Sweeps refers to the transfer of a settlement account's available balance
 * to a pre-configured payout account." A transaction carries no status; the
 * settlement-transaction:created event fires when "`SWEEP` has been executed"
 * (https://docs.tink.com/resources/payments/one-time-payments/get-started-settlement-accounts),
 * so a SWEEP transaction is an executed payout: 'paid'.
 *
 * Tink can revert a payout afterwards: PAYMENT_REVERSAL, "The reversal of a
 * payment from the account. Indicates that the payout has been reverted
 * after being initially marked as succeeded." That reversal is its own
 * transaction (a balance transaction of type 'adjustment'); the SWEEP stays
 * 'paid' here, as it was when it executed, the way a Stripe payout record
 * would only change status if the platform changed it.
 *
 * The amount's sign is passed through as Tink sends it: no example shows a
 * SWEEP amount, so nothing here negates or takes an absolute value.
 */
import type { Payout } from '../../../schema/payout'
import {
  amountToMinor,
  isoDate,
  requireId,
  stringMap,
  text,
  type RawTinkTransaction,
} from './shared'

export function transformPayout(raw: RawTinkTransaction): Payout {
  const id = requireId(raw.id, 'transaction')
  const { amount, currency } = amountToMinor(raw.amount, `transaction ${id}`)
  return {
    id,
    externalId: id,
    amount,
    currency,
    status: 'paid',
    statementDescriptor: text(raw.reference),
    gateway: 'tink',
    metadata: stringMap(raw.metadata),
    createdAt: isoDate(raw.timestamp),
    raw,
  }
}
