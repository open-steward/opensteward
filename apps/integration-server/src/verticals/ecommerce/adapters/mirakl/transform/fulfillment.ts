/**
 * Mirakl Shipment → canonical Fulfillment.
 *
 * Mirakl exposes shipments via the Multiple-Shipments API:
 *   GET  /api/shipments  (ST11) — paginated list of shipments
 *   POST /api/shipments  (ST01) — create shipments
 *
 * A Mirakl shipment groups one or more order lines from the same order into
 * a single tracked parcel. The `id` field in the shipment object is the
 * canonical shipment identifier.
 *
 * Status mapping:
 *   SHIPPING   → OPEN
 *   SHIPPED    → SUCCESS
 *   RECEIVED   → SUCCESS
 *   CANCELED   → CANCELLED
 *   (other)    → PENDING
 *
 * Docs: https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3/multiple-shipments/st11
 */

import type { Fulfillment, FulfillmentStatus, FulfillmentLineItem } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Mirakl shipment shapes ────────────────────────────────────────────────

export interface RawMiraklShipmentTracking {
  tracking_number?: string | null
  carrier_name?: string | null
  carrier_code?: string | null
  tracking_url?: string | null
  carrier_expected_delivery_date?: {
    earliest?: string | null
    latest?: string | null
  } | null
}

export interface RawMiraklShipmentLine {
  order_line_id?: string | null
  offer_sku?: string | null
  quantity?: number | null
  package_reference?: string | null
  [key: string]: unknown
}

export interface RawMiraklShipment {
  id?: string | null
  order_id?: string | null
  status?: string | null
  tracking?: RawMiraklShipmentTracking | null
  shipment_lines?: RawMiraklShipmentLine[] | null
  created_date?: string | null
  shipped_date?: string | null
  last_updated_date?: string | null
  invoice_reference?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(status: string | null | undefined): FulfillmentStatus | undefined {
  switch (status) {
    case 'SHIPPING':
      return 'OPEN'
    case 'SHIPPED':
    case 'RECEIVED':
      return 'SUCCESS'
    case 'CANCELED':
      return 'CANCELLED'
    case 'PENDING':
      return 'PENDING'
    default:
      return status ? 'PENDING' : undefined
  }
}

function mapLines(
  lines: RawMiraklShipmentLine[] | null | undefined,
): FulfillmentLineItem[] | undefined {
  if (!lines || lines.length === 0) return undefined
  return lines.map((l) => ({
    lineItemId: String(l.order_line_id ?? l.offer_sku ?? ''),
    quantity: l.quantity ?? 1,
  }))
}

export function transformShipment(raw: RawMiraklShipment): Fulfillment {
  const tracking = raw.tracking
  const estimatedDelivery =
    tracking?.carrier_expected_delivery_date?.earliest ??
    tracking?.carrier_expected_delivery_date?.latest

  return {
    id: String(raw.id ?? ''),
    orderId: String(raw.order_id ?? ''),
    status: mapStatus(raw.status),
    trackingNumber: tracking?.tracking_number ?? undefined,
    trackingUrl: tracking?.tracking_url ?? undefined,
    carrier: tracking?.carrier_name ?? tracking?.carrier_code ?? undefined,
    lineItems: mapLines(raw.shipment_lines),
    shippedAt: toIsoDatetime(raw.shipped_date) ?? raw.shipped_date ?? undefined,
    estimatedDeliveryAt: toIsoDatetime(estimatedDelivery) ?? estimatedDelivery ?? undefined,
    createdAt: toIsoDatetime(raw.created_date) ?? raw.created_date ?? undefined,
    updatedAt: toIsoDatetime(raw.last_updated_date) ?? raw.last_updated_date ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
