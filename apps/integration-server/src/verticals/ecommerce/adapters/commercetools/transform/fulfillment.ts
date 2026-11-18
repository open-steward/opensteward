/**
 * commercetools "Fulfillment" is a derived view, not a first-class
 * resource. This module projects a canonical Fulfillment from an order's
 * shipping + shipmentState fields. There is NO `untransform` — create,
 * update and cancel are not implemented by the adapter.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawCtOrder } from './order'

const SHIPMENT_TO_FULFILLMENT: Record<string, FulfillmentStatus> = {
  Shipped: 'SUCCESS',
  Ready: 'OPEN',
  Pending: 'PENDING',
  Partial: 'OPEN',
  Backorder: 'PENDING',
  Delayed: 'PENDING',
}

/**
 * Project a canonical Fulfillment from a commercetools Order.
 *
 * The id mirrors the order id 1:1 — commercetools has at most one
 * conceptual "fulfillment" per order (the shipmentState machine). Rich
 * tracking and shipment-level detail live on platform-specific custom
 * fields / type extensions and are preserved in `metadata`.
 */
export function transformFulfillment(order: RawCtOrder): Fulfillment {
  const shipmentState = order.shipmentState
  return {
    id: order.id,
    orderId: order.id,
    status: shipmentState ? SHIPMENT_TO_FULFILLMENT[shipmentState] ?? undefined : undefined,
    createdAt: order.createdAt,
    updatedAt: order.lastModifiedAt,
    metadata: {
      orderId: order.id,
      shipmentState,
      note: 'commercetools has no first-class Fulfillment resource; this is a projection from order.shipmentState.',
    },
  }
}
