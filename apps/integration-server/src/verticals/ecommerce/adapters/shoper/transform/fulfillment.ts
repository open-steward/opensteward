/**
 * Shoper Delivery → canonical Fulfillment.
 *
 * Shoper tracks deliveries (shipments) under:
 *   GET /webapi/rest/deliveries[/{id}]
 *
 * Each delivery record holds the carrier, tracking number, and
 * a reference to the order it fulfills.
 */

import type {
  Fulfillment,
  FulfillmentStatus,
} from '../../../schema/fulfillment'

// ── Raw Shoper shapes ────────────────────────────────────────────────────────

export interface RawShoperDelivery {
  delivery_id?: number | string
  order_id?: number | string | null
  /** Tracking/waybill number. */
  waybill?: string | null
  /** Carrier / courier name. */
  carrier?: string | null
  /** Direct tracking URL provided by the carrier. */
  tracking_url?: string | null
  /** Shoper internal status (e.g. "sent", "delivered"). */
  status?: string | null
  sent_date?: string | null
  delivery_date?: string | null
  add_date?: string | null
  edit_date?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  sent: 'SUCCESS',
  delivered: 'SUCCESS',
  pending: 'PENDING',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  error: 'ERROR',
}

function mapStatus(s: string | null | undefined): FulfillmentStatus | undefined {
  if (!s) return undefined
  return STATUS_MAP[s.toLowerCase()] ?? undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawShoperDelivery): Fulfillment {
  return {
    id: String(raw.delivery_id ?? ''),
    orderId: String(raw.order_id ?? ''),
    status: mapStatus(raw.status),
    trackingNumber: raw.waybill ?? undefined,
    trackingUrl: raw.tracking_url ?? undefined,
    carrier: raw.carrier ?? undefined,
    service: undefined,
    locationId: undefined,
    lineItems: undefined,
    notifyCustomer: undefined,
    shippedAt: raw.sent_date ?? undefined,
    estimatedDeliveryAt: undefined,
    deliveredAt: raw.delivery_date ?? undefined,
    createdAt: raw.add_date ?? undefined,
    updatedAt: raw.edit_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → Shoper delivery body (for create/update). */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    order_id: fulfillment.orderId,
    waybill: fulfillment.trackingNumber,
    carrier: fulfillment.carrier,
    tracking_url: fulfillment.trackingUrl,
  }
}
