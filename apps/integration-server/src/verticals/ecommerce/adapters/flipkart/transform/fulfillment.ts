/**
 * Flipkart Shipments / Order Items → canonical Fulfillment.
 *
 * Flipkart tracks shipments at the order-item level. Each order item has
 * a status that progresses through: APPROVED → PACKING → PACKED →
 * READY_TO_DISPATCH → SHIPPED → DELIVERED.
 *
 * The adapter projects order items with shipping info onto the canonical
 * Fulfillment shape. Flipkart also provides shipment-level tracking
 * numbers and carrier info via the Shipments API.
 *
 * Fulfillment id format: `${orderId}:${orderItemId}` — synthetic,
 * similar to the Amazon SP adapter.
 *
 * Docs: https://seller.flipkart.com/api-docs/order-api-docs/OMAPIRef.html
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawFlipkartOrderItem } from './order'

export interface RawFlipkartShipment {
  shipment_id: string
  order_item_id: string
  order_id: string
  tracking_id?: string
  carrier?: string
  dispatch_date?: string
  delivery_date?: string
  status?: string
  [key: string]: unknown
}

/**
 * Map Flipkart's order item status to canonical fulfillment status.
 */
function mapStatus(status: string | undefined): FulfillmentStatus {
  if (!status) return 'PENDING'
  const upper = status.toUpperCase()
  switch (upper) {
    case 'DELIVERED':
      return 'SUCCESS'
    case 'SHIPPED':
    case 'READY_TO_DISPATCH':
      return 'OPEN'
    case 'CANCELLED':
      return 'CANCELLED'
    case 'APPROVED':
    case 'PACKING':
    case 'PACKED':
    default:
      return 'PENDING'
  }
}

/**
 * Project one Flipkart order item into a canonical Fulfillment.
 */
export function transformFulfillment(
  orderId: string,
  item: RawFlipkartOrderItem,
  shipment?: RawFlipkartShipment,
): Fulfillment {
  const fulfillmentType = (item['fulfillment_type'] as string | undefined) ?? undefined
  const service = fulfillmentType === 'FLIPKART' ? 'Flipkart Assured' : fulfillmentType ?? undefined

  return {
    id: shipment?.shipment_id ?? `${orderId}:${item.order_item_id}`,
    orderId,
    status: mapStatus(item.order_item_status),
    trackingNumber: shipment?.tracking_id,
    carrier: shipment?.carrier,
    service,
    lineItems: [
      {
        lineItemId: item.order_item_id,
        quantity: item.quantity,
      },
    ],
    shippedAt: shipment?.dispatch_date,
    deliveredAt: shipment?.delivery_date,
    metadata: {
      skuId: item.sku_id,
      listingId: item.listing_id,
      orderItemStatus: item.order_item_status,
      ...(shipment ? { shipment } : {}),
      raw: item,
    },
  }
}

/**
 * Build a fulfillment list for an order by projecting every order item.
 */
export function transformFulfillments(
  orderId: string,
  items: RawFlipkartOrderItem[] | undefined,
  shipments?: RawFlipkartShipment[],
): Fulfillment[] {
  if (!items || items.length === 0) return []
  return items.map((item) => {
    const shipment = shipments?.find((s) => s.order_item_id === item.order_item_id)
    return transformFulfillment(orderId, item, shipment)
  })
}
