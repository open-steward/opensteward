/**
 * nopCommerce order refund → canonical Refund.
 *
 * nopCommerce does not have a dedicated refund API endpoint. Refunds are
 * modelled as order status transitions (payment_status → "Refunded" /
 * "PartiallyRefunded"). The adapter synthesizes Refund objects from order
 * data when the payment status indicates a refund.
 *
 * For the transform layer we accept a simplified shape that the adapter
 * constructs from order data.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawNopRefund {
  id: number | string
  order_id: number | string
  amount?: number
  reason?: string | null
  refunded_on_utc?: string | null
  currency?: string
  [key: string]: unknown
}

export function transformRefund(
  raw: RawNopRefund,
  orderId: string,
  currency: string = 'USD',
): Refund {
  const cur = raw.currency ?? currency
  return {
    id: String(raw.id),
    orderId,
    amount: raw.amount != null ? { amount: majorToMinor(raw.amount, cur), currency: cur } : undefined,
    reason: raw.reason ?? undefined,
    restock: false,
    processedAt: raw.refunded_on_utc ?? undefined,
    createdAt: raw.refunded_on_utc ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    amount: refund.amount?.amount != null ? refund.amount.amount / 100 : undefined,
    reason: refund.reason,
  }
}
