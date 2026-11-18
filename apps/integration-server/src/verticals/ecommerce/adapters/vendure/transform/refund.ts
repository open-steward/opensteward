/**
 * Vendure Refund -> canonical Refund.
 *
 * Vendure refunds are nested in `order.payments[].refunds[]`.
 * Each refund has an id, total (in cents), reason, and state.
 * Composite id: `{orderId}:{paymentId}:{refundId}`.
 */

import type { Refund } from '../../../schema/refund'

export interface RawVendureRefund {
  /** Composite id set by the adapter: `orderId:paymentId:refundId`. */
  id: string
  orderId: string
  total?: number // cents
  reason?: string | null
  state?: string
  transactionId?: string | null
  paymentId?: string
  createdAt?: string
  [key: string]: unknown
}

export function transformRefund(raw: RawVendureRefund): Refund {
  return {
    id: raw.id,
    orderId: raw.orderId,
    amount: raw.total != null
      ? { amount: Math.round(raw.total), currency: 'USD' }
      : undefined,
    reason: raw.reason ?? undefined,
    transactionIds: raw.paymentId ? [raw.paymentId] : undefined,
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    // Canonical amount is already integer cents — pass through for Vendure.
    amount: refund.amount?.amount != null ? Math.round(refund.amount.amount) : undefined,
    reason: refund.reason,
  }
}
