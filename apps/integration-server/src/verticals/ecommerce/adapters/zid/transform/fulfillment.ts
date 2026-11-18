/**
 * Zid Order → canonical Fulfillment (shipping leg of an order).
 *
 * Zid does not have a dedicated /fulfillments resource. Shipping/tracking
 * information lives on the order itself under `shipping`. We synthesise a
 * single Fulfillment from the order's shipping data.
 *
 * Fulfillment status is derived from order_status.code:
 *   new / preparing / ready  → PENDING (not yet shipped)
 *   indelivery               → OPEN    (in transit)
 *   delivered                → SUCCESS
 *   canceled / cancelled     → CANCELLED
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawZidOrder } from './order'

// ── Mapping ───────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  new: 'PENDING',
  preparing: 'PENDING',
  ready: 'PENDING',
  indelivery: 'OPEN',
  delivered: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Build a canonical Fulfillment from a Zid order. The fulfillment id is the
 * order id (Zid has one fulfillment per order).
 */
export function transformFulfillment(raw: RawZidOrder): Fulfillment {
  const statusCode = raw.order_status?.code?.toLowerCase()
  const shipping = raw.shipping ?? {}

  return {
    id: String(raw.id ?? ''),
    orderId: String(raw.id ?? ''),
    status: statusCode ? STATUS_MAP[statusCode] ?? undefined : undefined,
    trackingNumber: shipping.tracking_number ?? undefined,
    trackingUrl: shipping.tracking_url ?? undefined,
    carrier: shipping.method?.name ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → Zid change-order-status body. */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    tracking_number: fulfillment.trackingNumber,
    tracking_url: fulfillment.trackingUrl,
  }
}
