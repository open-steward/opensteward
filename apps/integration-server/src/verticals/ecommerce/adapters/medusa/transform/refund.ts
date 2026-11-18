/**
 * Medusa v2 Refund → canonical Refund.
 *
 * Medusa v2 refunds are created via `POST /admin/orders/{id}/refunds`.
 * The refund amount is in integer cents (minor units), which is already the
 * canonical `Money.amount` representation — pass through unchanged.
 */

import type { Refund } from '../../../schema/refund'

export interface RawMedusaRefund {
  id: string
  order_id?: string
  amount?: number
  reason?: string | null
  note?: string | null
  payment_id?: string | null
  created_at?: string
  [key: string]: unknown
}

export function transformRefund(
  raw: RawMedusaRefund,
  orderId: string,
  currency: string = 'USD',
): Refund {
  const amount =
    raw.amount != null ? { amount: Math.round(raw.amount), currency } : undefined
  return {
    id: raw.id,
    orderId: raw.order_id ?? orderId,
    amount,
    reason: raw.reason ?? undefined,
    note: raw.note ?? undefined,
    transactionIds: raw.payment_id ? [raw.payment_id] : undefined,
    processedAt: raw.created_at,
    createdAt: raw.created_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    amount: refund.amount?.amount != null ? Math.round(refund.amount.amount) : undefined,
    reason: refund.reason,
    note: refund.note,
  }
}
