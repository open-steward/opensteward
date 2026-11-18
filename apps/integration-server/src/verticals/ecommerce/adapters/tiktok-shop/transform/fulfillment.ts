/**
 * TikTok Shop package / shipping → canonical Fulfillment.
 *
 * TikTok Shop manages shipping through its fulfillment system. Packages
 * are created when a seller ships an order. The adapter projects order-level
 * and package-level shipping info into canonical Fulfillment records.
 *
 * Fulfillment id format: `${order_id}:${package_id}` or `${order_id}:shipping`
 * when no package is available.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawTikTokOrder } from './order'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawTikTokPackage {
  id?: string
  tracking_number?: string
  shipping_provider_id?: string
  shipping_provider_name?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map a documented order `status` (Get Order Detail 202309: UNPAID, ON_HOLD,
 * AWAITING_SHIPMENT, PARTIALLY_SHIPPING, AWAITING_COLLECTION, IN_TRANSIT,
 * DELIVERED, COMPLETED, CANCELLED) to canonical fulfillment status.
 */
export function mapFulfillmentStatus(orderStatus: string | undefined): FulfillmentStatus {
  switch (orderStatus) {
    case 'UNPAID':
    case 'ON_HOLD':
      return 'PENDING'
    case 'AWAITING_SHIPMENT':
    case 'AWAITING_COLLECTION':
    case 'PARTIALLY_SHIPPING':
      return 'OPEN'
    case 'IN_TRANSIT':
    case 'DELIVERED':
    case 'COMPLETED':
      return 'SUCCESS'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Build a fulfillment from an order + optional package info.
 */
export function transformFulfillment(order: RawTikTokOrder, pkg?: RawTikTokPackage): Fulfillment {
  // A TikTok line item is one unit ("Each single item in a line is
  // identified by its unique order line item id", Order API overview).
  const lineItems = (order.line_items ?? []).flatMap((item) =>
    item.id ? [{ lineItemId: item.id, quantity: 1 }] : [],
  )

  const packageId = pkg?.id ?? 'shipping'

  return {
    id: `${order.id}:${packageId}`,
    orderId: order.id,
    status: mapFulfillmentStatus(order.status),
    trackingNumber: pkg?.tracking_number,
    carrier: pkg?.shipping_provider_name,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    // rts_time: "The time sellers shipped the order".
    shippedAt: order.rts_time ? new Date(order.rts_time * 1000).toISOString() : undefined,
    createdAt: order.create_time ? new Date(order.create_time * 1000).toISOString() : undefined,
    metadata: {
      order_id: order.id,
      order_status: order.status,
      package: pkg ?? null,
      raw_order: order,
    },
  }
}
