/**
 * Webflow Refund → canonical Refund.
 *
 * Webflow does not have a dedicated refunds API. Refunds are triggered
 * through the Stripe integration and reflected on the order's `stripeDetails`.
 * The adapter synthesises refund records from order data when `refundedOn` is set.
 */

import type { Refund } from '../../../schema/refund'

export interface RawWebflowRefund {
  id?: string
  orderId: string
  amount?: number
  currency?: string
  reason?: string
  note?: string
  refundedOn?: string | null
  createdOn?: string
  [key: string]: unknown
}

export function transformRefund(raw: RawWebflowRefund): Refund {
  const currency = raw.currency ?? 'USD'
  return {
    id: raw.id ?? raw.orderId,
    orderId: raw.orderId,
    amount:
      raw.amount != null
        ? { amount: Math.round(raw.amount), currency }
        : undefined,
    reason: raw.reason ?? undefined,
    note: raw.note ?? undefined,
    processedAt: raw.refundedOn ?? undefined,
    createdAt: raw.createdOn,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    reason: refund.reason,
  }
}
