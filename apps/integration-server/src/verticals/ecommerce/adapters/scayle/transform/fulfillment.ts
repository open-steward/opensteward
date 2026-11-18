/**
 * SCAYLE Shipment → canonical Fulfillment.
 *
 * SCAYLE calls fulfillments "shipments" in the Admin API. The create endpoint
 * is `POST /fulfillment/shipments`. Individual shipment retrieval is not
 * exposed in the Admin API — shipment data is embedded inside order packages.
 *
 * SCAYLE shipment body:
 *  - orderReferenceKey / orderId, packageId, trackingId, carrierId,
 *    carrierServiceId, trackingUrl, warehouseId, items[] (orderItemId, quantity)
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

import type { Fulfillment, FulfillmentLineItem } from '../../../schema/fulfillment'

// ── Raw SCAYLE shapes (minimal) ──────────────────────────────────────────────

export interface RawScayleShipmentItem {
  orderItemId?: number | string
  quantity?: number
}

export interface RawScayleShipment {
  /** SCAYLE does not return a shipment id on the create response; callers may synthesise one. */
  id?: number | string
  orderId?: number | string
  orderReferenceKey?: string | null
  packageId?: number | string | null
  trackingId?: string | null
  trackingUrl?: string | null
  carrierId?: number | string | null
  carrierReferenceKey?: string | null
  warehouseId?: number | string | null
  warehouseReferenceKey?: string | null
  items?: RawScayleShipmentItem[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapLineItems(
  raw: RawScayleShipmentItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((item) => ({
    lineItemId: String(item.orderItemId ?? ''),
    quantity: item.quantity ?? 1,
  }))
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawScayleShipment): Fulfillment {
  const id = raw.id != null
    ? String(raw.id)
    : `${raw.orderId ?? raw.orderReferenceKey ?? ''}:${raw.packageId ?? ''}`
  return {
    id,
    orderId: raw.orderId != null ? String(raw.orderId) : (raw.orderReferenceKey ?? ''),
    status: 'SUCCESS',
    trackingNumber: raw.trackingId ?? undefined,
    trackingUrl: raw.trackingUrl ?? undefined,
    locationId: raw.warehouseId != null ? String(raw.warehouseId) : (raw.warehouseReferenceKey ?? undefined),
    lineItems: mapLineItems(raw.items),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → SCAYLE shipment body (for create). */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    orderId: fulfillment.orderId ? parseInt(fulfillment.orderId, 10) || fulfillment.orderId : undefined,
    trackingId: fulfillment.trackingNumber,
    trackingUrl: fulfillment.trackingUrl,
    warehouseId: fulfillment.locationId ? parseInt(fulfillment.locationId, 10) || undefined : undefined,
    items: fulfillment.lineItems?.map((li) => ({
      orderItemId: parseInt(li.lineItemId, 10) || li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
