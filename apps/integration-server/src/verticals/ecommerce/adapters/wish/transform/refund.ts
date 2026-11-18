/**
 * Wish Order Refund → canonical Refund.
 *
 * Wish's `order/refund` endpoint accepts:
 *   - order_id
 *   - reason_code (integer reason code)
 *   - reason_note (free-text note)
 *
 * Wish does not surface a separate refund resource with its own id — the
 * refund is applied directly to the order and the order state changes to
 * `refunded`. We synthesise a Refund from the order fields so the canonical
 * layer has something to work with.
 *
 * Money is always USD (major-unit decimal values from the API).
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

/** Reason codes accepted by `order/refund`. */
export const WISH_REFUND_REASON_CODES = {
  /** Item not as described. */
  NOT_AS_DESCRIBED: 1,
  /** Item never arrived. */
  NEVER_ARRIVED: 2,
  /** Order cancelled before shipment. */
  ORDER_CANCELLED: 4,
  /** Other reason. */
  OTHER: 7,
} as const

/** Wish currency is always USD. */
const WISH_CURRENCY = 'USD'

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

/**
 * Raw Wish refund data sourced from an order's refund-state fields.
 * Wish does not expose refunds as separate API resources; we build this
 * shape from order data when state === 'refunded'.
 */
export interface RawWishRefund {
  order_id: string
  /** Refund amount in USD major units. */
  refund_to_customer?: number | string | null
  reason_note?: string | null
  /** Unix epoch integer or ISO-8601 datetime string for when the refund was processed. */
  refunded_time?: string | number | null
  /** Unix epoch integer or ISO-8601 datetime string for when the order was created. */
  created_time?: string | number
  [key: string]: unknown
}

export function transformRefund(raw: RawWishRefund): Refund {
  const amount = toNum(raw.refund_to_customer)
  return {
    id: String(raw.order_id),
    orderId: String(raw.order_id),
    amount:
      amount > 0
        ? { amount: majorToMinor(amount, WISH_CURRENCY), currency: WISH_CURRENCY }
        : undefined,
    note: raw.reason_note ?? undefined,
    processedAt: toIsoDatetime(raw.refunded_time),
    createdAt: toIsoDatetime(raw.created_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Wish order/refund body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    order_id: refund.orderId,
    reason_note: refund.note,
    reason_code: WISH_REFUND_REASON_CODES.OTHER,
  }
}
