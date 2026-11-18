/**
 * fabric Fulfillment → canonical Fulfillment.
 *
 * fabric fulfillments endpoint: `GET /v3/orders/{orderId}/fulfillments`.
 * Each fulfillment has tracking info, status, line items, and shipment details.
 *
 * Status mapping:
 *   - pending   → PENDING
 *   - open      → OPEN
 *   - success   → SUCCESS
 *   - cancelled → CANCELLED
 *   - error     → ERROR
 *   - failure   → FAILURE
 */

import type { Fulfillment, FulfillmentStatus, FulfillmentLineItem } from '../../../schema/fulfillment'

export interface RawFabricFulfillmentLineItem {
  line_item_id: string
  quantity: number
  [key: string]: unknown
}

export interface RawFabricFulfillment {
  id: string
  order_id?: string
  status?: string
  tracking_number?: string
  tracking_url?: string
  carrier?: string
  service?: string
  location_id?: string
  shipment_id?: string
  line_items?: RawFabricFulfillmentLineItem[]
  notify_customer?: boolean
  shipped_at?: string
  estimated_delivery_at?: string
  delivered_at?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(status: string | undefined): FulfillmentStatus | undefined {
  switch (status) {
    case 'pending': return 'PENDING'
    case 'open': return 'OPEN'
    case 'success': return 'SUCCESS'
    case 'cancelled': return 'CANCELLED'
    case 'error': return 'ERROR'
    case 'failure': return 'FAILURE'
    default: return 'unknown'
  }
}

function mapLineItem(raw: RawFabricFulfillmentLineItem): FulfillmentLineItem {
  return {
    lineItemId: raw.line_item_id,
    quantity: raw.quantity,
  }
}

export function transformFulfillment(raw: RawFabricFulfillment): Fulfillment {
  return {
    id: raw.id,
    orderId: raw.order_id ?? '',
    status: mapStatus(raw.status),
    trackingNumber: raw.tracking_number,
    trackingUrl: raw.tracking_url,
    carrier: raw.carrier,
    service: raw.service,
    locationId: raw.location_id,
    shipmentId: raw.shipment_id,
    lineItems: raw.line_items?.map(mapLineItem),
    notifyCustomer: raw.notify_customer,
    shippedAt: raw.shipped_at,
    estimatedDeliveryAt: raw.estimated_delivery_at,
    deliveredAt: raw.delivered_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    tracking_number: fulfillment.trackingNumber,
    tracking_url: fulfillment.trackingUrl,
    carrier: fulfillment.carrier,
    service: fulfillment.service,
    location_id: fulfillment.locationId,
    notify_customer: fulfillment.notifyCustomer,
    line_items: fulfillment.lineItems?.map((li) => ({
      line_item_id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
