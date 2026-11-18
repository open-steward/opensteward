/**
 * Shopee logistics / shipping → canonical Fulfillment.
 *
 * Shopee manages shipping through its logistics system. The adapter
 * projects order-level shipping info into canonical Fulfillment records.
 *
 * Fulfillment id format: `${order_sn}:shipping` — synthetic, since
 * Shopee doesn't expose a per-shipment id in the order data.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawShopeeOrder } from './order'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawShopeeTrackingInfo {
  tracking_number?: string
  shipping_carrier?: string
  logistics_channel_name?: string
  logistics_status?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Shopee order status to canonical fulfillment status.
 */
export function mapFulfillmentStatus(orderStatus: string | undefined): FulfillmentStatus {
  if (!orderStatus) return 'PENDING'
  switch (orderStatus.toUpperCase()) {
    case 'READY_TO_SHIP':
    case 'PROCESSED':
      return 'OPEN'
    case 'SHIPPED':
      return 'SUCCESS'
    case 'COMPLETED':
      return 'SUCCESS'
    case 'CANCELLED':
    case 'IN_CANCEL':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Build a fulfillment from an order + optional tracking info.
 */
export function transformFulfillment(
  order: RawShopeeOrder,
  tracking?: RawShopeeTrackingInfo,
): Fulfillment {
  const lineItems = (order.item_list ?? []).map((item) => ({
    lineItemId: item.order_item_id != null
      ? String(item.order_item_id)
      : String(item.item_id ?? '0'),
    quantity: item.model_quantity_purchased ?? 1,
  }))

  return {
    id: `${order.order_sn}:shipping`,
    orderId: order.order_sn,
    status: mapFulfillmentStatus(order.order_status),
    trackingNumber: tracking?.tracking_number,
    carrier: tracking?.shipping_carrier ?? tracking?.logistics_channel_name,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippedAt:
      order.order_status?.toUpperCase() === 'SHIPPED' && order.update_time
        ? new Date(order.update_time * 1000).toISOString()
        : undefined,
    createdAt: order.create_time
      ? new Date(order.create_time * 1000).toISOString()
      : undefined,
    metadata: {
      order_sn: order.order_sn,
      order_status: order.order_status,
      tracking: tracking ?? null,
      raw_order: order,
    },
  }
}
