/**
 * Daraz order items / logistics → canonical Fulfillment.
 *
 * Daraz does not have a standalone "fulfillment" resource. We project
 * fulfillment data from order items and logistics tracking. Each order
 * item with a shipment provider or tracking code is treated as a
 * fulfillment record.
 *
 * Fulfillment id format: `${orderId}:${orderItemId}` — synthetic.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawDarazOrderItem } from './order'

/**
 * Map Daraz order item status to canonical fulfillment status.
 */
export function mapFulfillmentStatus(status: string | undefined): FulfillmentStatus {
  if (!status) return 'PENDING'
  switch (status.toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'packed':
    case 'ready_to_ship':
      return 'OPEN'
    case 'shipped':
    case 'delivered':
      return 'SUCCESS'
    case 'cancelled':
    case 'returned':
      return 'CANCELLED'
    case 'failed':
      return 'FAILURE'
    default:
      return 'PENDING'
  }
}

/**
 * Project one Daraz order item into a canonical Fulfillment.
 */
export function transformFulfillment(
  orderId: string,
  item: RawDarazOrderItem,
): Fulfillment {
  const trackingCode = (item['tracking_code'] as string | undefined) ?? undefined
  const shipmentProvider = (item['shipment_provider'] as string | undefined) ?? undefined
  const trackingUrl = (item['tracking_url'] as string | undefined) ?? undefined

  return {
    id: `${orderId}:${String(item.order_item_id ?? '')}`,
    orderId,
    status: mapFulfillmentStatus(item.status),
    trackingNumber: trackingCode,
    trackingUrl,
    carrier: shipmentProvider,
    lineItems: [
      {
        lineItemId: String(item.order_item_id ?? ''),
        quantity: item.quantity ?? 1,
      },
    ],
    metadata: {
      sellerSku: item.sku,
      shopSku: item.shop_sku,
      status: item.status,
      raw: item,
    },
  }
}

/**
 * Build a fulfillment list for an order from its items.
 */
export function transformFulfillments(
  orderId: string,
  items: RawDarazOrderItem[] | undefined,
): Fulfillment[] {
  if (!items || items.length === 0) return []
  return items.map((i) => transformFulfillment(orderId, i))
}
