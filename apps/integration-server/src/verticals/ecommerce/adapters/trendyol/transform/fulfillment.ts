/**
 * Trendyol shipment package → canonical Fulfillment.
 *
 * Trendyol does not have a dedicated fulfillment API endpoint. Cargo/tracking
 * details are embedded in each shipment package returned by:
 *   GET /integration/order/sellers/{sellerId}/orders
 *
 * The fulfillment is therefore DERIVED from the order endpoint. A fulfillment
 * record is synthesized for any shipment package that has a tracking number or
 * is in a shipped/delivered status.
 *
 * Key mapping decisions:
 *
 *   shipmentPackageId    → Fulfillment.id
 *   shipmentPackageId    → Fulfillment.orderId (same id — Trendyol orders = packages)
 *   cargoTrackingNumber  → Fulfillment.trackingNumber
 *   cargoTrackingLink    → Fulfillment.trackingUrl
 *   cargoProviderName    → Fulfillment.carrier
 *   shipmentPackageStatus→ mapped to canonical FulfillmentStatus
 *   lines                → Fulfillment.lineItems
 *   lastModifiedDate     → Fulfillment.updatedAt
 *   orderDate            → Fulfillment.createdAt
 *
 * Status mapping:
 *   Shipped / Delivered / UnDelivered / AtCollectionPoint → SUCCESS
 *   Created / Picking / Invoiced                         → OPEN
 *   Cancelled / UnSupplied                               → CANCELLED
 *   default                                              → PENDING
 *
 * Docs: https://developers.trendyol.com/v2.0/docs/get-order-packages-getshipmentpackages
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawTrendyolOrder } from './order'

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapFulfillmentStatus(status: string | null | undefined): FulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'shipped':
    case 'delivered':
    case 'undelivered':
    case 'atcollectionpoint':
    case 'unpacked':
    case 'repack':
      return 'SUCCESS'
    case 'created':
    case 'picking':
    case 'invoiced':
      return 'OPEN'
    case 'cancelled':
    case 'unsupplied':
      return 'CANCELLED'
    case 'returned':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawTrendyolOrder): Fulfillment {
  const status = raw.shipmentPackageStatus ?? raw.status
  const packageId = String(raw.shipmentPackageId)

  return {
    id: packageId,
    orderId: packageId,
    status: mapFulfillmentStatus(status),
    trackingNumber:
      raw.cargoTrackingNumber != null ? String(raw.cargoTrackingNumber) : undefined,
    trackingUrl: raw.cargoTrackingLink ?? undefined,
    carrier: raw.cargoProviderName ?? undefined,
    lineItems: (raw.lines ?? []).map((li) => ({
      lineItemId: String(li.lineId),
      quantity: li.quantity != null ? Math.max(li.quantity, 0) : 1,
    })),
    createdAt: toIsoDatetime(raw.orderDate),
    updatedAt: toIsoDatetime(raw.lastModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
