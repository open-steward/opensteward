/**
 * Saleor TransactionItem → canonical Transaction.
 *
 * Fields per docs.saleor.io/api-reference/payments/objects/transaction-item.
 * TransactionItem has no status or type of its own; its `events`
 * ("List of all transaction's events") each carry a `type`
 * (TransactionEventTypeEnum), an `amount` ("The amount related to this
 * event.", `Money!`) and a `createdAt`. `kind`, `status` and `amount` all
 * come from the most recent event whose type names a payment action, so the
 * three describe the same step. A transaction with no such event leaves them
 * unset.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawSaleorTransactionEvent {
  type?: string | null
  amount: { amount: number; currency: string }
  createdAt: string
}

export interface RawSaleorTransaction {
  id: string
  pspReference?: string | null
  events?: RawSaleorTransactionEvent[]
  order?: { id?: string } | null
  createdAt?: string
  [key: string]: unknown
}

/**
 * TransactionEventTypeEnum → [kind, status], for the values that name one.
 *
 * The enum's descriptions are one-liners ("CHARGE_SUCCESS - represents success
 * charge.", "CHARGE_REQUEST - represents charge request."), so parts of this
 * map are interpretation, not quotation: CHARGE_* is read as CAPTURE (a charge
 * with no earlier authorisation would arguably be a SALE; Saleor does not say
 * which), and *_REQUEST is read as PENDING from the word "request".
 */
const EVENT_MAP: Record<string, [TransactionKind, TransactionStatus]> = {
  AUTHORIZATION_SUCCESS: ['AUTHORIZATION', 'SUCCESS'],
  AUTHORIZATION_FAILURE: ['AUTHORIZATION', 'FAILURE'],
  AUTHORIZATION_REQUEST: ['AUTHORIZATION', 'PENDING'],
  CHARGE_SUCCESS: ['CAPTURE', 'SUCCESS'],
  CHARGE_FAILURE: ['CAPTURE', 'FAILURE'],
  CHARGE_REQUEST: ['CAPTURE', 'PENDING'],
  REFUND_SUCCESS: ['REFUND', 'SUCCESS'],
  REFUND_FAILURE: ['REFUND', 'FAILURE'],
  REFUND_REQUEST: ['REFUND', 'PENDING'],
  CANCEL_SUCCESS: ['VOID', 'SUCCESS'],
  CANCEL_FAILURE: ['VOID', 'FAILURE'],
  CANCEL_REQUEST: ['VOID', 'PENDING'],
}

function latestMappedEvent(
  events: RawSaleorTransactionEvent[] | undefined,
): { event: RawSaleorTransactionEvent; mapped: [TransactionKind, TransactionStatus] } | undefined {
  let best:
    { event: RawSaleorTransactionEvent; mapped: [TransactionKind, TransactionStatus] } | undefined
  for (const event of events ?? []) {
    const mapped = event.type ? EVENT_MAP[event.type] : undefined
    if (!mapped) continue
    if (!best || Date.parse(event.createdAt) >= Date.parse(best.event.createdAt))
      best = { event, mapped }
  }
  return best
}

export function transformTransaction(raw: RawSaleorTransaction): Transaction {
  const latest = latestMappedEvent(raw.events)
  const amount = latest?.event.amount

  return {
    id: raw.id,
    orderId: raw.order?.id ?? undefined,
    kind: latest?.mapped[0],
    status: latest?.mapped[1],
    amount: amount
      ? { amount: majorToMinor(amount.amount, amount.currency), currency: amount.currency }
      : undefined,
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformTransaction(transaction: Partial<Transaction>): Record<string, unknown> {
  return {
    amount: transaction.amount
      ? minorToMajor(transaction.amount.amount, transaction.amount.currency)
      : undefined,
    currency: transaction.amount?.currency,
    pspReference: transaction.gateway,
  }
}
