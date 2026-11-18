/**
 * Wix order payment → canonical Transaction.
 *
 * Source: List Transactions For Single Order,
 *   https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-transactions/list-transactions-for-single-order.md
 *   "URL: https://www.wixapis.com/ecom/v1/payments/orders/{orderId}"
 * whose `orderTransactions.payments` is the "Record of payments made to the
 * merchant". A payment's `amount` is a `Price` ("amount | type: string")
 * with no currency; the currency is the order's (`order.currency`), which
 * the caller passes in. Without it the amount is left out.
 *
 * Ids are `orderId:paymentId`: a payment GUID can only be read back through
 * its order, so the order id travels with it.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Transaction, TransactionStatus } from '../../../schema/transaction'
import { wixPriceToMoney, type RawWixPrice } from './order'

export interface RawWixPayment {
  id?: string
  createdDate?: string
  updatedDate?: string
  amount?: RawWixPrice
  refundDisabled?: boolean
  /**
   * "Overall payment status." enum: APPROVED, PENDING, PENDING_MERCHANT,
   * CANCELED, DECLINED, REFUNDED, PARTIALLY_REFUNDED, AUTHORIZED, VOIDED.
   */
  status?: string
  [key: string]: unknown
}

/** Statuses with no canonical counterpart map to 'unknown'. */
const STATUS_MAP: Record<string, TransactionStatus> = {
  // "Payment was charged successfully."
  APPROVED: 'SUCCESS',
  // "Payment is being processed and hasn't been confirmed yet."
  PENDING: 'PENDING',
  // "Payment is awaiting confirmation."
  PENDING_MERCHANT: 'PENDING',
  // "Payment was declined by the payment provider."
  DECLINED: 'FAILURE',
}

/** Composite id of a payment: `orderId:paymentId`. */
export function wixPaymentKey(orderId: string, paymentId: string): string {
  return `${orderId}:${paymentId}`
}

export function transformTransaction(
  raw: RawWixPayment,
  orderId: string,
  currency: string | undefined,
): Transaction {
  if (!raw.id) throw new Error(`Wix order ${orderId} has a payment with no id`)
  return {
    id: wixPaymentKey(orderId, raw.id),
    orderId,
    status: raw.status ? (STATUS_MAP[raw.status] ?? 'unknown') : undefined,
    amount: wixPriceToMoney(raw.amount, currency),
    createdAt: toIsoDatetime(raw.createdDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
