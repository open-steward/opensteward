/**
 * Noon fulfillment / shipment -> canonical Fulfillment.
 *
 * Noon has first-class fulfillment objects tied to orders. Each fulfillment
 * contains tracking information and line item references.
 *
 * Fulfillment status mapping:
 *   pending       -> PENDING
 *   picked        -> OPEN
 *   packed        -> OPEN
 *   shipped       -> SUCCESS
 *   delivered     -> SUCCESS
 *   cancelled     -> CANCELLED
 *   failed        -> FAILURE
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

export interface RawNoonFulfillmentItem {
  order_item_id?: string | number
  sku?: string
  quantity?: number
  [key: string]: unknown
}

export interface RawNoonFulfillment {
  fulfillment_id?: string | number
  order_id?: string | number
  status?: string
  tracking_number?: string
  tracking_url?: string
  carrier?: string
  service_type?: string
  items?: RawNoonFulfillmentItem[]
  shipped_at?: string
  estimated_delivery_at?: string
  delivered_at?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

/**
 * Map Noon fulfillment status to canonical fulfillment status.
 */
export function mapFulfillmentStatus(status: string | undefined): FulfillmentStatus {
  if (!status) return 'PENDING'
  switch (status.toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'picked':
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
 * Noon fulfillment -> canonical Fulfillment.
 */
export function transformFulfillment(raw: RawNoonFulfillment): Fulfillment {
  const lineItems = (raw.items ?? []).map((item) => ({
    lineItemId: String(item.order_item_id ?? ''),
    quantity: item.quantity ?? 1,
  }))

  return {
    id: String(raw.fulfillment_id ?? ''),
    orderId: String(raw.order_id ?? ''),
    status: mapFulfillmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    trackingUrl: raw.tracking_url ?? undefined,
    carrier: raw.carrier ?? undefined,
    service: raw.service_type ?? undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippedAt: raw.shipped_at ?? undefined,
    estimatedDeliveryAt: raw.estimated_delivery_at ?? undefined,
    deliveredAt: raw.delivered_at ?? undefined,
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a fulfillment list from raw Noon fulfillment records.
 */
export function transformFulfillments(
  items: RawNoonFulfillment[] | undefined,
): Fulfillment[] {
  if (!items || items.length === 0) return []
  return items.map((i) => transformFulfillment(i))
}
