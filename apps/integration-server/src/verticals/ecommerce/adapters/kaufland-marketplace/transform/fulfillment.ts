/**
 * Kaufland Marketplace OrderUnit → canonical Fulfillment.
 *
 * Kaufland does not have a first-class "fulfillment" resource. Fulfillment is
 * achieved by calling PATCH /order-units/{id}/send with tracking_numbers and
 * carrier_code, which transitions the order-unit status to "sent".
 *
 * We therefore represent each order-unit as a canonical Fulfillment. The
 * fulfillment id is the id_order_unit, and the orderId is id_order.
 *
 * Docs: https://sellerapi.kaufland.com/?page=managing-orders
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw Kaufland shapes ───────────────────────────────────────────────────────

/**
 * An order-unit as returned by GET /order-units/{id_order_unit} or embedded
 * within GET /orders/{id_order}. Only fulfillment-relevant fields are typed
 * here (full shape is in order.ts).
 */
export interface RawKauflandOrderUnitForFulfillment {
  id_order_unit: number | string
  id_order?: string | null
  status?: string | null
  /** Comma-separated tracking numbers set by the seller at shipment. */
  tracking_numbers?: string | null
  /** Carrier code (e.g. "DHL", "HERMES"). */
  carrier_code?: string | null
  ts_created_iso?: string | null
  ts_updated_iso?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  need_to_be_sent: 'OPEN',
  sent: 'SUCCESS',
  cancelled: 'CANCELLED',
  returned: 'CANCELLED',
}

function mapStatus(s: string | null | undefined): FulfillmentStatus | undefined {
  if (!s) return undefined
  return STATUS_MAP[s.toLowerCase()] ?? undefined
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformFulfillment(
  raw: RawKauflandOrderUnitForFulfillment,
): Fulfillment {
  // Kaufland tracking_numbers is a comma-separated string; surface the first.
  const trackingNumbers = raw.tracking_numbers
    ? raw.tracking_numbers.split(',').map((t) => t.trim()).filter(Boolean)
    : []
  const trackingNumber = trackingNumbers[0]

  return {
    id: String(raw.id_order_unit),
    orderId: String(raw.id_order ?? raw.id_order_unit),
    status: mapStatus(raw.status),
    trackingNumber,
    carrier: raw.carrier_code ?? undefined,
    lineItems: [{ lineItemId: String(raw.id_order_unit), quantity: 1 }],
    createdAt: raw.ts_created_iso ?? undefined,
    updatedAt: raw.ts_updated_iso ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build the PATCH /order-units/{id}/send request body from a canonical
 * Fulfillment. Both tracking_numbers and carrier_code are required by
 * Kaufland.
 */
export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    tracking_numbers: fulfillment.trackingNumber ?? '',
    carrier_code: fulfillment.carrier ?? '',
  }
}
