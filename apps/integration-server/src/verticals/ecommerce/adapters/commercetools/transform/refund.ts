/**
 * commercetools Refund extraction.
 *
 * commercetools has no dedicated Refund resource — refunds live as
 * `type: 'Refund'` entries inside a Payment's `transactions[]` array.
 * The canonical `Refund.id` is therefore `paymentId:transactionId` so
 * `getRefund` can locate the record with a single payment read.
 */

import type { Refund } from '../../../schema/refund'
import { moneyFromCt } from './variant'
import type { RawCtPayment, RawCtTransaction } from './transaction'

/**
 * Build a canonical Refund from a commercetools Payment + refund
 * transaction. `orderId` must be supplied by the caller (derived from
 * the order whose `paymentInfo.payments[]` references this payment).
 */
export function transformRefund(
  payment: RawCtPayment,
  tx: RawCtTransaction,
  orderId: string,
): Refund {
  return {
    id: `${payment.id}:${tx.id}`,
    orderId,
    amount: moneyFromCt(tx.amount),
    processedAt: tx.timestamp,
    createdAt: payment.createdAt,
    metadata: { payment, transaction: tx } as unknown as Record<string, unknown>,
  }
}

/**
 * Extract all canonical Refunds from a commercetools Payment. Non-Refund
 * transactions (Authorization, Charge, etc.) are filtered out.
 */
export function transformPaymentRefunds(
  payment: RawCtPayment,
  orderId: string,
): Refund[] {
  return (payment.transactions ?? [])
    .filter((tx) => tx.type === 'Refund' || tx.type === 'Chargeback')
    .map((tx) => transformRefund(payment, tx, orderId))
}

/**
 * Canonical Refund → commercetools `addTransaction` action body with
 * `type: 'Refund'`. Used by `POST /payments/{paymentId}` updates.
 */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    type: 'Refund',
    amount: refund.amount
      ? {
          type: 'centPrecision',
          currencyCode: refund.amount.currency,
          centAmount: Math.round(refund.amount.amount),
        }
      : undefined,
  }
}
