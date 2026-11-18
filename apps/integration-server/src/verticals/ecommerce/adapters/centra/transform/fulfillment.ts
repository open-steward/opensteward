/**
 * Centra Order API Shipment → canonical Fulfillment.
 *
 * Centra uses "shipments" rather than "fulfillments". GET /shipments response:
 *  - `shipmentId`          — stable shipment id
 *  - `orderId`             — parent order id
 *  - `shippedDate`         — ISO-8601 date when shipped
 *  - `carrier`             — carrier name (e.g. "DHL")
 *  - `service`             — service level (e.g. "Express")
 *  - `trackingId`          — tracking number (Centra field name)
 *  - `trackingUrl`         — tracking URL
 *  - `warehouseId`         — warehouse / location id
 *  - `products[]`          — [{lineId, qty, …}]
 *  - `shouldCapture`       — whether payment capture is pending
 *
 * Centra shipment status is implicit: if the record exists it has been
 * fulfilled (SUCCESS). Cancelled shipments may not be returned.
 *
 * Docs: https://centra.dev/docs/apis/order-api/api-reference
 */

import type {
  Fulfillment,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCentraShipmentLineItem {
  lineId: number | string
  qty: number
  [key: string]: unknown
}

export interface RawCentraShipment {
  shipmentId: number | string
  orderId: number | string
  shippedDate?: string | null
  carrier?: string | null
  service?: string | null
  trackingId?: string | null
  trackingUrl?: string | null
  warehouseId?: number | string | null
  warehouseName?: string | null
  products?: RawCentraShipmentLineItem[]
  shouldCapture?: boolean
  [key: string]: unknown
}

function mapLineItems(raw: RawCentraShipmentLineItem[] | undefined): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({ lineItemId: String(li.lineId), quantity: li.qty }))
}

export function transformFulfillment(raw: RawCentraShipment): Fulfillment {
  return {
    id: String(raw.shipmentId),
    orderId: String(raw.orderId),
    // Centra shipments that exist are fulfilled; no explicit status field.
    status: 'SUCCESS',
    trackingNumber: raw.trackingId ?? undefined,
    trackingUrl: raw.trackingUrl ?? undefined,
    carrier: raw.carrier ?? undefined,
    service: raw.service ?? undefined,
    locationId: raw.warehouseId != null ? String(raw.warehouseId) : undefined,
    lineItems: mapLineItems(raw.products),
    createdAt: toIsoDatetime(raw.shippedDate),
    updatedAt: toIsoDatetime(raw.shippedDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    carrier: fulfillment.carrier,
    service: fulfillment.service,
    trackingId: fulfillment.trackingNumber,
    trackingUrl: fulfillment.trackingUrl,
    warehouseId: fulfillment.locationId,
    products: fulfillment.lineItems?.map((li) => ({
      lineId: li.lineItemId,
      qty: li.quantity,
    })),
  }
}
