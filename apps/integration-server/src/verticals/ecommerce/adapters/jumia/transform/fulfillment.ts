/**
 * Jumia order items / shipments → canonical Fulfillment.
 *
 * Jumia has a shipment concept for orders. Each order item with a tracking code
 * or shipment status is treated as a fulfillment record.
 *
 * Fulfillment id format: `${orderId}:${orderItemId}` — synthetic.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawJumiaOrderItem } from './order'

/**
 * Map Jumia order item status to canonical fulfillment status.
 */
export function mapFulfillmentStatus(status: string | undefined): FulfillmentStatus {
  if (!status) return 'PENDING'
  switch (status.toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'ready_to_ship':
    case 'packed':
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
 * Project one Jumia order item into a canonical Fulfillment.
 */
export function transformFulfillment(
  orderId: string,
  item: RawJumiaOrderItem,
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
      sellerSku: item.seller_sku ?? item.sku,
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
  items: RawJumiaOrderItem[] | undefined,
): Fulfillment[] {
  if (!items || items.length === 0) return []
  return items.map((i) => transformFulfillment(orderId, i))
}
