/**
 * nopCommerce order shipment → canonical Fulfillment.
 *
 * nopCommerce exposes shipments under `/api/orders/{orderId}/shipments`.
 * Each shipment record carries a tracking number, carrier info, and line items.
 */
import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

export interface RawNopShipmentItem {
  id?: number | string
  order_item_id?: number | string
  quantity?: number
  [key: string]: unknown
}

export interface RawNopShipment {
  id?: number | string
  order_id?: number | string
  tracking_number?: string | null
  admin_comment?: string | null
  shipped_date_utc?: string | null
  delivery_date_utc?: string | null
  created_on_utc?: string | null
  shipment_items?: RawNopShipmentItem[]
  [key: string]: unknown
}

function mapStatus(raw: RawNopShipment): FulfillmentStatus {
  if (raw.delivery_date_utc) return 'SUCCESS'
  if (raw.shipped_date_utc) return 'OPEN'
  return 'PENDING'
}

export function transformFulfillment(raw: RawNopShipment, orderId: string): Fulfillment {
  const lineItems = (raw.shipment_items ?? []).map((item) => ({
    lineItemId: String(item.order_item_id ?? item.id ?? ''),
    quantity: typeof item.quantity === 'number' ? item.quantity : 1,
  }))

  return {
    id: String(raw.id ?? ''),
    orderId,
    status: mapStatus(raw),
    trackingNumber: raw.tracking_number ?? undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippedAt: raw.shipped_date_utc ?? undefined,
    deliveredAt: raw.delivery_date_utc ?? undefined,
    createdAt: raw.created_on_utc ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
