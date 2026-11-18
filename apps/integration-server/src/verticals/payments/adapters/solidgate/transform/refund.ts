import type { Refund, RefundStatus } from '../../../schema/refund'
import { sgDatetime } from './shared'

/**
 * One entry of a card order's `transactions[]` in the card-orders report
 * (POST https://reports.solidgate.com/api/v1/card-orders). Required there:
 * id, operation, status, amount, currency, created_at, updated_at.
 */
export interface RawSolidgateTransaction {
  id: string
  operation: string
  status: string
  amount: number
  currency: string
  created_at: string
  updated_at: string
  refund_reason?: string
  refund_reason_code?: string
}

/**
 * Transaction statuses, from
 * https://docs.solidgate.com/payments/card-payments/card-payments-insights/payment-lifecycle/#transaction-status:
 * processing "currently undergoing processing", verify "undergoing 3D Secure
 * verification", success "successfully processed", fail "has been rejected".
 */
const STATUS: Record<string, RefundStatus> = {
  processing: 'pending',
  verify: 'pending',
  success: 'succeeded',
  fail: 'failed',
}

/** A refund is a transaction whose `operation` is `refund`, on the order `orderId`. */
export function transformRefund(tx: RawSolidgateTransaction, orderId: string): Refund {
  return {
    id: tx.id,
    externalId: tx.id,
    chargeId: orderId,
    amount: tx.amount,
    currency: tx.currency.toUpperCase(),
    status: STATUS[tx.status] ?? 'unknown',
    gateway: 'solidgate',
    metadata: {
      ...(tx.refund_reason ? { refund_reason: tx.refund_reason } : {}),
      ...(tx.refund_reason_code ? { refund_reason_code: tx.refund_reason_code } : {}),
    },
    createdAt: sgDatetime(tx.created_at),
    updatedAt: sgDatetime(tx.updated_at),
    raw: tx,
  }
}
