/**
 * Lemon Squeezy Order Refund → canonical Refund.
 *
 * Lemon Squeezy does not expose a dedicated refund list endpoint. Refunds
 * are modelled as fully-refunded orders (status = "refunded") or as partial
 * credits applied via the dashboard. The Subscriptions Cancel endpoint
 * (DELETE /v1/subscriptions/{id}) also drives a refund when
 * `refund: 'partial'` or `'all'` is set.
 *
 * This transform covers the "refund" shape returned by the order endpoint
 * when status is "refunded": the order id becomes the orderId, the total
 * amount paid is treated as the refund amount, and `refunded_at` is the
 * processedAt timestamp.
 *
 * Docs: https://docs.lemonsqueezy.com/api/orders/the-order-object
 */

import type { Refund } from '../../../schema/refund'
import type { LsResource } from '../client'

// ── Raw shape ────────────────────────────────────────────────────────────────

export interface RawLsRefundAttributes {
  /** The order id this refund belongs to. */
  order_id: number
  store_id: number
  /** Amount in cents already paid (= refund amount for full refunds). */
  total: number
  currency: string
  /** ISO datetime when the order was refunded. */
  refunded_at?: string | null
  /** Free-text reason (Lemon Squeezy does not surface a structured reason). */
  reason?: string | null
  identifier?: string
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export type RawLsRefund = LsResource<RawLsRefundAttributes>

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawLsRefund): Refund {
  const attrs = raw.attributes
  const currency = attrs.currency ?? 'USD'

  return {
    id: raw.id,
    orderId: String(attrs.order_id),
    amount: attrs.total != null ? { amount: attrs.total, currency } : undefined,
    reason: attrs.reason ?? undefined,
    processedAt: attrs.refunded_at ?? attrs.updated_at,
    createdAt: attrs.refunded_at ?? attrs.created_at,
    metadata: { id: raw.id, type: raw.type, ...attrs },
  }
}
