/**
 * SendOwl Refund → canonical Refund.
 *
 * Docs: https://dashboard.sendowl.com/developers/api/orders (refunds are
 * documented as part of the order resource, not a resource of their own).
 *
 * There is no `GET /refunds` or `GET /refunds/{id}` endpoint. Refunds live
 * only as an embedded `refund_transactions[].refund_transaction` array on
 * the order (`refunded: true` + this array), and are created via
 * `POST /api/v1/orders/#{order_id}/refund` with `{ amount, ... }`. A
 * `refund_transaction` carries no id of its own, so one is synthesized as
 * `${orderId}:${index}` (index into the array as returned by the API).
 */
import type { Refund } from '../../../schema/refund'

export interface RawSendOwlRefundTransaction {
  /** Decimal string, negative (e.g. `"-3.00"`). */
  amount?: string
  currency?: string
  occurred_at?: string
  reason?: string
  [key: string]: unknown
}

export interface RawSendOwlRefundTransactionEnvelope {
  refund_transaction: RawSendOwlRefundTransaction
}

export function transformRefundTransaction(
  raw: RawSendOwlRefundTransaction,
  orderId: string,
  index: number,
): Refund {
  // `amount` is optional on the canonical schema — when either half of the
  // Money is missing we omit it rather than guess a currency.
  const amount =
    raw.amount != null && raw.currency != null
      ? { amount: Math.round(Math.abs(Number(raw.amount)) * 100), currency: raw.currency }
      : undefined
  return {
    id: `${orderId}:${index}`,
    orderId,
    amount,
    reason: raw.reason,
    processedAt: raw.occurred_at,
    createdAt: raw.occurred_at,
    metadata: { ...raw },
  }
}

/** Flatten an order's embedded `refund_transactions` into canonical Refunds. */
export function extractRefunds(
  orderId: string,
  rawTransactions: RawSendOwlRefundTransactionEnvelope[] | undefined,
): Refund[] {
  if (!rawTransactions || rawTransactions.length === 0) return []
  return rawTransactions.map((entry, index) =>
    transformRefundTransaction(entry.refund_transaction, orderId, index),
  )
}
