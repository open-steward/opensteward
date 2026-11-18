/**
 * Bagisto Shipment → canonical Fulfillment.
 *
 * Bagisto exposes a dedicated `GET /api/v1/shipments` endpoint that returns
 * shipment objects linked to orders via `order_id` / `order`. Each shipment
 * can carry tracking details and an inventory source (Bagisto's multi-source
 * equivalent of a location).
 *
 * Bagisto shipment status values (inventory_source_shipment_items status):
 *   The shipment object itself does not carry a top-level status — we infer
 *   it from `total_qty_shipped` vs `total_qty_ordered` on order, or just
 *   treat every shipment record as SUCCESS (shipped). The order-level
 *   `status` is used to distinguish cancelled shipments.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw Bagisto shapes ────────────────────────────────────────────────────────

export interface BagistoShipmentItem {
  id?: number | string
  order_item_id?: number | string
  name?: string
  sku?: string
  qty?: number
  [key: string]: unknown
}

export interface BagistoShipment {
  id: number | string
  order_id?: number | string
  carrier_title?: string | null
  track_number?: string | null
  track_url?: string | null
  total_qty?: number | null
  items?: BagistoShipmentItem[]
  inventory_source?: { id?: number | string; name?: string } | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Bagisto shipments are always in a "shipped" state. If `track_number` is
 * absent the shipment is still considered OPEN (label printed but not
 * scanned). Cancelled shipments do not appear in the API.
 */
function mapFulfillmentStatus(raw: BagistoShipment): FulfillmentStatus {
  if (raw.track_number) return 'SUCCESS'
  return 'OPEN'
}

export function transformFulfillment(raw: BagistoShipment): Fulfillment {
  const orderId = raw.order_id != null ? String(raw.order_id) : 'unknown'

  const lineItems = (raw.items ?? []).map((item) => ({
    lineItemId:
      item.order_item_id != null ? String(item.order_item_id) : String(item.id ?? ''),
    quantity: item.qty ?? 1,
  }))

  const locationId =
    raw.inventory_source?.id != null ? String(raw.inventory_source.id) : undefined

  return {
    id: String(raw.id),
    orderId,
    status: mapFulfillmentStatus(raw),
    trackingNumber: raw.track_number ?? undefined,
    trackingUrl: raw.track_url ?? undefined,
    carrier: raw.carrier_title ?? undefined,
    locationId,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
