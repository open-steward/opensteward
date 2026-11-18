/**
 * Wish Order Fulfillment → canonical Fulfillment.
 *
 * Wish tracks fulfillment at the order level (one order = one shipment).
 * The `order/fulfill-one` endpoint accepts:
 *   - order_id
 *   - tracking_provider (carrier name, e.g. "USPS")
 *   - tracking_number
 *   - shipped_on_date (ISO date, e.g. "2024-01-20")
 *
 * After shipping the order object itself carries the tracking details in
 * `tracking_provider`, `tracking_number`, and `tracking_url` fields. We
 * surface these as a Fulfillment synthesised from the order-level data.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

/**
 * Raw Wish fulfillment data sourced from an order's tracking fields.
 * This is not a separate API resource — the adapter synthesises it from the
 * order response when tracking information is present.
 */
export interface RawWishFulfillment {
  /** Same as order_id — Wish uses the order id as the fulfillment id. */
  order_id: string
  /** Order state e.g. 'shipped', 'completed'. */
  state?: string
  /** Carrier/provider name (e.g. "USPS"). */
  tracking_provider?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  /** Unix epoch integer or ISO-8601 datetime string for when the order was last updated. */
  last_updated?: string | number
  /** Unix epoch integer or ISO-8601 datetime string for when the order was created. */
  created_time?: string | number
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  shipped: 'SUCCESS',
  completed: 'SUCCESS',
  approved: 'PENDING',
  refunded: 'CANCELLED',
}

export function transformFulfillment(raw: RawWishFulfillment): Fulfillment {
  const state = raw.state?.toLowerCase()
  return {
    id: String(raw.order_id),
    orderId: String(raw.order_id),
    status: state ? (STATUS_MAP[state] ?? undefined) : undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    trackingUrl: raw.tracking_url ?? undefined,
    carrier: raw.tracking_provider ?? undefined,
    updatedAt: toIsoDatetime(raw.last_updated),
    createdAt: toIsoDatetime(raw.created_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → Wish order/fulfill-one body. */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    order_id: fulfillment.orderId,
    tracking_provider: fulfillment.carrier,
    tracking_number: fulfillment.trackingNumber,
  }
}
