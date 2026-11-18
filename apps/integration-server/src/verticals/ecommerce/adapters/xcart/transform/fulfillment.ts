/**
 * X-Cart Order → canonical Fulfillment.
 *
 * X-Cart does not have a standalone fulfillment resource. Shipping info is
 * embedded in each order as `shipping_tracking_number`, `shipping_method`,
 * and `shipping_status`. We synthesize one Fulfillment per order that has
 * been shipped.
 *
 * The canonical Fulfillment id is derived from the order id with a
 * `-fulfillment` suffix so callers can reconstruct the order id from
 * `getFulfillment` by splitting on `-fulfillment`.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { XCartOrder } from './order'

// Re-export for convenience
export type { XCartOrder }

function mapFulfillmentStatus(shippingStatus: string | null | undefined): FulfillmentStatus {
  if (!shippingStatus) return 'PENDING'
  switch (shippingStatus.toLowerCase()) {
    case 'shipped':
      return 'SUCCESS'
    case 'delivered':
      return 'SUCCESS'
    case 'processing':
    case 'new':
      return 'OPEN'
    case 'cancelled':
    case 'returned':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

export function transformFulfillment(raw: XCartOrder): Fulfillment {
  const orderId = String(raw.order_id)
  const fulfillmentId = `${orderId}-fulfillment`

  const shippedAt =
    raw.date != null ? new Date(raw.date * 1000).toISOString() : undefined

  return {
    id: fulfillmentId,
    orderId,
    status: mapFulfillmentStatus(raw.shipping_status),
    trackingNumber: raw.shipping_tracking_number ?? undefined,
    carrier: raw.shipping_method ?? undefined,
    lineItems: (raw.items ?? []).map((item) => ({
      lineItemId: item.item_id != null ? String(item.item_id) : String(item.product_id ?? ''),
      quantity: item.qty,
    })),
    shippedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
