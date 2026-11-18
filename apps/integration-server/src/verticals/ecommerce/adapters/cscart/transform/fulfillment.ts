/**
 * CS-Cart Shipment → canonical Fulfillment.
 *
 * CS-Cart exposes shipments at `GET /api/shipments` (list) and
 * `GET /api/shipments/{id}` (detail). Each shipment links back to an order
 * via `order_id` and may carry tracking info. Shipment status maps to the
 * canonical FulfillmentStatus.
 *
 * CS-Cart shipment statuses (shipping_status):
 *  - `""` or absent → PENDING
 *  - `A` = Advanced / Active → OPEN
 *  - `P` = Processed → SUCCESS
 *  - `D` = Delivered → SUCCESS
 *  - `C` = Cancelled → CANCELLED
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw CS-Cart shape ────────────────────────────────────────────────────────

export interface CsCartShipmentProduct {
  item_id?: number | string
  amount?: number | string
  [key: string]: unknown
}

export interface CsCartShipment {
  shipment_id: number | string
  order_id?: number | string
  shipping_id?: number | string
  carrier?: string | null
  tracking_number?: string | null
  timestamp?: number | string
  status?: string | null
  products?: CsCartShipmentProduct[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(s: string | null | undefined): FulfillmentStatus {
  if (!s) return 'PENDING'
  switch (s.toUpperCase()) {
    case 'A':
      return 'OPEN'
    case 'P':
    case 'D':
      return 'SUCCESS'
    case 'C':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

function tsToIso(ts: number | string | null | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!n || Number.isNaN(n)) return undefined
  return new Date(n * 1000).toISOString()
}

// ── Exports ──────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: CsCartShipment): Fulfillment {
  const orderId = raw.order_id != null ? String(raw.order_id) : ''

  return {
    id: String(raw.shipment_id),
    orderId,
    status: mapStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrier: raw.carrier ?? undefined,
    lineItems: (raw.products ?? []).map((p) => ({
      lineItemId: p.item_id != null ? String(p.item_id) : '',
      quantity: p.amount != null ? Number(p.amount) : 1,
    })),
    shippedAt: tsToIso(raw.timestamp),
    createdAt: tsToIso(raw.timestamp),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
