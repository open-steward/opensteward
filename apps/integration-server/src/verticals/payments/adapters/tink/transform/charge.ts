/**
 * Tink settlement-account PAYIN transaction → canonical Charge.
 *
 * SettlementAccountTransactionType PAYIN: "Received payment which increases
 * settlement account balance." A transaction carries no status field; a PAYIN
 * exists once it has been received: the settlement-transaction:created event
 * fires when "`PAYIN` has been processed"
 * (https://docs.tink.com/resources/payments/one-time-payments/get-started-settlement-accounts).
 * So a PAYIN is 'succeeded'. A later REVERT is its own transaction and is
 * not reflected here.
 *
 * Only PAYIN is a charge. EXTERNAL_PAYIN, "Received direct bank payment
 * (outside Tink PIS).", is a scoping exclusion: Tink does not say who sends
 * it, and the guide's own manual top-up is such a payment ("To pay in to a
 * settlement account using a manual bank transfer, use the account
 * identifier ..."), so it is not presented as a customer charge. It is a
 * balance transaction of type 'other'.
 *
 * Tink documents no customer, fee or refunded-amount field on a transaction,
 * so customerId, amountRefunded and the like stay unset.
 */
import type { Charge } from '../../../schema/charge'
import {
  amountToMinor,
  isoDate,
  requireId,
  stringMap,
  text,
  type RawTinkTransaction,
} from './shared'

export function transformCharge(raw: RawTinkTransaction): Charge {
  const id = requireId(raw.id, 'transaction')
  const { amount, currency } = amountToMinor(raw.amount, `transaction ${id}`)
  return {
    id,
    externalId: id,
    amount,
    currency,
    status: 'succeeded',
    description: text(raw.reference),
    gateway: 'tink',
    metadata: stringMap(raw.metadata),
    createdAt: isoDate(raw.timestamp),
    raw,
  }
}
