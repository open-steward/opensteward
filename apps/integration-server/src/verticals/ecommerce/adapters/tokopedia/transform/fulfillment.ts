/**
 * Tokopedia order shipping → canonical Fulfillment.
 *
 * Tokopedia manages shipping through its logistics system (integrated
 * with Gojek). The adapter projects order-level shipping info into
 * canonical Fulfillment records.
 *
 * Fulfillment id format: `${order_id}:shipping` — synthetic, since
 * Tokopedia doesn't expose a separate fulfillment id.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'
import type { RawTokopediaOrder } from './order'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawTokopediaShippingInfo {
  order_id?: number
  shipping_ref?: string
  awb?: string
  logistic_name?: string
  logistic_service?: string
  shipping_status?: number
  delivered_date?: string
  shipping_date?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Tokopedia order status to canonical fulfillment status.
 *
 * Order status mapping:
 *   < 400 → PENDING (not yet accepted)
 *   400-499 → OPEN (accepted, awaiting pickup)
 *   500-599 → SUCCESS (shipped)
 *   600+ → SUCCESS (delivered/completed)
 *   < 100 → CANCELLED
 */
export function mapFulfillmentStatus(orderStatus: number | undefined): FulfillmentStatus {
  if (orderStatus == null) return 'PENDING'
  if (orderStatus < 100) return 'CANCELLED'
  if (orderStatus < 400) return 'PENDING'
  if (orderStatus < 500) return 'OPEN'
  return 'SUCCESS'
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Build a fulfillment from an order + optional shipping info.
 */
export function transformFulfillment(
  order: RawTokopediaOrder,
  shipping?: RawTokopediaShippingInfo,
): Fulfillment {
  const orderId = String(order.order_id ?? 0)
  const lineItems = (order.products ?? []).map((item) => ({
    lineItemId: item.id != null ? String(item.id) : '0',
    quantity: item.quantity ?? 1,
  }))

  const awb = shipping?.awb ?? order.shipment_fulfillment?.awb
  const carrier = shipping?.logistic_name ?? order.shipment_fulfillment?.logistic_name
  const service = shipping?.logistic_service ?? order.shipment_fulfillment?.logistic_service

  return {
    id: `${orderId}:shipping`,
    orderId,
    status: mapFulfillmentStatus(order.order_status),
    trackingNumber: awb,
    carrier,
    service,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippedAt: toIsoDatetime(shipping?.shipping_date),
    deliveredAt: toIsoDatetime(shipping?.delivered_date),
    createdAt: toIsoDatetime(order.create_time),
    metadata: {
      order_id: order.order_id,
      order_status: order.order_status,
      shipping: shipping ?? null,
      shipment_fulfillment: order.shipment_fulfillment ?? null,
    },
  }
}
