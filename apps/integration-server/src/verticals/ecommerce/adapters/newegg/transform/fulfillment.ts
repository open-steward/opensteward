/**
 * Newegg Package / Shipment → canonical Fulfillment.
 *
 * Newegg ships orders via the shipment confirmation endpoint:
 *   POST /ordermgmt/order/shipment → confirm shipment
 *
 * Shipment info is embedded in the order's PackageInfoList. Each package
 * contains carrier, tracking number, ship date, and the items in that
 * package.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawNeweggPackage {
  OrderNumber: string
  PackageType?: string
  ShipCarrier?: string
  ShipService?: string
  TrackingNumber?: string
  ShipDate?: string
  ShipFromAddress?: string
  ShipFromCity?: string
  ShipFromState?: string
  ShipFromZipCode?: string
  ItemList?: Array<{
    SellerPartNumber?: string
    Quantity?: number
  }>
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function inferStatus(raw: RawNeweggPackage): FulfillmentStatus {
  // Newegg packages are confirmed shipments by definition
  if (raw.TrackingNumber) return 'SUCCESS'
  return 'PENDING'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawNeweggPackage): Fulfillment {
  const id = raw.TrackingNumber
    ? `${raw.OrderNumber}:${raw.TrackingNumber}`
    : `${raw.OrderNumber}:pkg`

  const lineItems = raw.ItemList?.map((item) => ({
    lineItemId: item.SellerPartNumber ?? '0',
    quantity: item.Quantity ?? 1,
  }))

  return {
    id,
    orderId: raw.OrderNumber,
    status: inferStatus(raw),
    trackingNumber: raw.TrackingNumber,
    carrier: raw.ShipCarrier,
    service: raw.ShipService,
    lineItems: lineItems && lineItems.length > 0 ? lineItems : undefined,
    shippedAt: raw.ShipDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Fulfillment → Newegg shipment confirmation body.
 */
export function untransformFulfillment(
  data: Partial<Fulfillment>,
): Record<string, unknown> {
  const itemList = data.lineItems?.map((li) => ({
    SellerPartNumber: li.lineItemId,
    Quantity: li.quantity,
  })) ?? []

  return {
    ShipCarrier: data.carrier ?? 'Other',
    ShipService: data.service ?? 'Other',
    TrackingNumber: data.trackingNumber ?? '',
    ShipDate: data.shippedAt ?? new Date().toISOString(),
    ItemList: itemList,
  }
}
