/**
 * Zalando zDirect Order-unit fulfillment → canonical Fulfillment.
 *
 * Zalando does not expose a dedicated "fulfillment" resource. Instead,
 * fulfillment is tracked per order-unit through status transitions and the
 * shipping notice (dispatch confirmation). We synthesize a Fulfillment from
 * the order-unit shipping data returned when a dispatch is confirmed.
 *
 * The canonical Fulfillment id is the order number (which is the natural
 * Zalando shipment id when shipping all units together).
 *
 * Docs: https://developers.merchants.zalando.com/docs/orders.html
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Zalando shapes ────────────────────────────────────────────────────────

export interface RawZalandoShipment {
  /** Zalando order number acting as the shipment reference. */
  order_number: string
  /** Carrier / logistics partner code (e.g. DHL, DPD). */
  carrier_name?: string | null
  /** Tracking number issued by the carrier. */
  tracking_number?: string | null
  /** Carrier tracking URL. */
  tracking_url?: string | null
  /** Service level (e.g. STANDARD, EXPRESS). */
  service_level?: string | null
  /** ISO-8601 timestamp when the parcel was dispatched. */
  dispatch_date?: string | null
  /** ISO-8601 timestamp of expected delivery. */
  estimated_delivery_date?: string | null
  /** ISO-8601 timestamp of actual delivery. */
  delivery_date?: string | null
  /** Status of this shipment. */
  status?: string | null
  /** Order unit ids included in this shipment. */
  order_unit_ids?: string[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  CREATED: 'PENDING',
  DISPATCHED: 'SUCCESS',
  IN_TRANSIT: 'SUCCESS',
  DELIVERED: 'SUCCESS',
  FAILED: 'FAILURE',
  CANCELED: 'CANCELLED',
  RETURNED: 'CANCELLED',
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawZalandoShipment): Fulfillment {
  const status: FulfillmentStatus = raw.status
    ? STATUS_MAP[raw.status.toUpperCase()] ?? 'OPEN'
    : 'OPEN'

  return {
    id: raw.order_number,
    orderId: raw.order_number,
    status,
    carrier: raw.carrier_name ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    trackingUrl: raw.tracking_url ?? undefined,
    service: raw.service_level ?? undefined,
    lineItems: raw.order_unit_ids?.map((unitId) => ({
      lineItemId: unitId,
      quantity: 1,
    })),
    shippedAt: toIsoDatetime(raw.dispatch_date),
    estimatedDeliveryAt: toIsoDatetime(raw.estimated_delivery_date),
    deliveredAt: toIsoDatetime(raw.delivery_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Build a Zalando dispatch-confirmation request body. */
export function untransformFulfillment(
  data: Partial<Fulfillment> & { orderUnitIds?: string[] },
): Record<string, unknown> {
  return {
    carrier_name: data.carrier,
    tracking_number: data.trackingNumber,
    tracking_url: data.trackingUrl,
    service_level: data.service,
    order_unit_ids: data.orderUnitIds ?? data.lineItems?.map((li) => li.lineItemId),
  }
}
