/**
 * Shuup Shipment → canonical Fulfillment.
 *
 * Shuup exposes a dedicated shipment resource at `/api/v1/shuup/shipment/`.
 * Each shipment belongs to an order via `order` (an integer id) and carries
 * optional tracking information.
 *
 * Status mapping (Shuup shipment status → canonical FulfillmentStatus):
 *   not_sent  → OPEN
 *   sent      → SUCCESS
 *   received  → SUCCESS
 *   (other)   → PENDING
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw Shuup shapes ─────────────────────────────────────────────────────────

export interface ShuupShipmentProduct {
  product?: number | string | null
  quantity?: number | string | null
  [key: string]: unknown
}

export interface ShuupShipment {
  id: number | string
  /** Order id (integer). */
  order?: number | string | null
  /** Shipment status string identifier. */
  status?: string | null
  tracking_code?: string | null
  tracking_url?: string | null
  carrier?: string | null
  service_name?: string | null
  created_on?: string | null
  shipped_at?: string | null
  products?: ShuupShipmentProduct[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapFulfillmentStatus(status: string | null | undefined): FulfillmentStatus {
  if (!status) return 'PENDING'
  switch (status.toLowerCase()) {
    case 'not_sent':
    case 'pending':
      return 'OPEN'
    case 'sent':
    case 'received':
    case 'delivered':
      return 'SUCCESS'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    case 'error':
      return 'ERROR'
    default:
      return 'PENDING'
  }
}

export function transformFulfillment(raw: ShuupShipment): Fulfillment {
  const shipmentId = String(raw.id)
  const orderId = raw.order != null ? String(raw.order) : 'unknown'

  const lineItems = (raw.products ?? []).map((p, i) => ({
    lineItemId: p.product != null ? String(p.product) : `${shipmentId}-item-${i}`,
    quantity: typeof p.quantity === 'string' ? parseFloat(p.quantity) : (p.quantity ?? 1),
  }))

  return {
    id: shipmentId,
    orderId,
    status: mapFulfillmentStatus(raw.status),
    trackingNumber: raw.tracking_code ?? undefined,
    trackingUrl: raw.tracking_url ?? undefined,
    carrier: raw.carrier ?? undefined,
    service: raw.service_name ?? undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippedAt: raw.shipped_at ?? raw.created_on ?? undefined,
    createdAt: raw.created_on ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
