/**
 * Squarespace Fulfillment → canonical Fulfillment.
 *
 * Squarespace has no standalone GET /fulfillments endpoint. Fulfillment data
 * is embedded inside the order object as the `fulfillments` array (one entry
 * per shipment). Each entry is derived from the order returned by
 * `GET /1.0/commerce/orders/{id}` or `GET /1.0/commerce/orders`.
 *
 * Docs: https://developers.squarespace.com/commerce-apis/retrieve-specific-order
 *       https://developers.squarespace.com/commerce-apis/fulfill-order
 */

import type { Fulfillment } from '../../../schema/fulfillment'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawSquarespaceShipment {
  /** Squarespace uses the order id + shipment index as a composite id. */
  id?: string | null
  carrierName?: string | null
  service?: string | null
  shipDate?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  [key: string]: unknown
}

// ── Transform ───────────────────────────────────────────────────────────────

/**
 * Transform a single Squarespace shipment entry (from an order's
 * `fulfillments` array) into a canonical Fulfillment.
 *
 * @param shipment  - Raw shipment object from the order.
 * @param orderId   - The parent order id (used to build a composite id).
 * @param index     - Zero-based position in the fulfillments array (used for
 *                    composite id when the shipment lacks its own id).
 */
export function transformFulfillment(
  shipment: RawSquarespaceShipment,
  orderId: string,
  index: number,
): Fulfillment {
  const id = shipment.id ?? `${orderId}:fulfillment:${index}`
  return {
    id,
    orderId,
    status: 'SUCCESS',
    trackingNumber: shipment.trackingNumber ?? undefined,
    trackingUrl: shipment.trackingUrl ?? undefined,
    carrier: shipment.carrierName ?? undefined,
    service: shipment.service ?? undefined,
    shippedAt: shipment.shipDate ?? undefined,
    metadata: shipment as unknown as Record<string, unknown>,
  }
}
