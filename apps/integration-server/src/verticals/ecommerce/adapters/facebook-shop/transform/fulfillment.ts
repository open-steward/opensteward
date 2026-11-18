/**
 * Facebook Commerce Shipment → canonical Fulfillment.
 *
 * Facebook Commerce API manages shipments per order:
 *   GET /{order_id}/shipments → list
 *   POST /{order_id}/shipments → create
 *
 * Each shipment has tracking info and item references.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawFacebookShipmentItem {
  item_id: string
  quantity: number
}

export interface RawFacebookTrackingInfo {
  tracking_number?: string
  carrier?: string
  shipping_method_name?: string
}

export interface RawFacebookShipment {
  id: string
  tracking_info?: RawFacebookTrackingInfo
  items?: RawFacebookShipmentItem[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Facebook shipments exist only after the seller ships — if a shipment
 * record exists with tracking, it's been shipped.
 */
function inferStatus(raw: RawFacebookShipment): FulfillmentStatus {
  if (raw.tracking_info?.tracking_number) return 'SUCCESS'
  return 'PENDING'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(
  orderId: string,
  raw: RawFacebookShipment,
): Fulfillment {
  const lineItems = (raw.items ?? []).map((li) => ({
    lineItemId: li.item_id,
    quantity: li.quantity,
  }))

  return {
    id: raw.id,
    orderId,
    status: inferStatus(raw),
    trackingNumber: raw.tracking_info?.tracking_number,
    carrier: raw.tracking_info?.carrier,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a fulfillment list from a Facebook shipments array response.
 */
export function transformFulfillments(
  orderId: string,
  items: RawFacebookShipment[] | undefined,
): Fulfillment[] {
  if (!items || items.length === 0) return []
  return items.map((i) => transformFulfillment(orderId, i))
}

/**
 * Canonical Fulfillment → Facebook create shipment body.
 */
export function untransformFulfillment(
  data: Partial<Fulfillment>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const trackingInfo: Record<string, unknown> = {}

  if (data.trackingNumber) trackingInfo['tracking_number'] = data.trackingNumber
  if (data.carrier) trackingInfo['carrier'] = data.carrier

  if (Object.keys(trackingInfo).length > 0) {
    body['tracking_info'] = trackingInfo
  }

  if (data.lineItems) {
    body['items'] = data.lineItems.map((li) => ({
      item_id: li.lineItemId,
      quantity: li.quantity,
    }))
  }

  return body
}
