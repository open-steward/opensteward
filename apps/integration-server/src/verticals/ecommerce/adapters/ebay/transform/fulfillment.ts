/**
 * eBay Shipping Fulfillment → canonical Fulfillment.
 *
 * eBay's Sell Fulfillment API exposes shipping fulfillments per order:
 *   GET /sell/fulfillment/v1/order/{orderId}/shipping_fulfillment → list
 *   GET .../shipping_fulfillment/{fulfillmentId} → get
 *   POST .../shipping_fulfillment → create
 *
 * Each fulfillment has a tracking number, carrier, and shipped date.
 * The fulfillment id is eBay's `fulfillmentId` string.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawEbayFulfillmentLineItem {
  lineItemId: string
  quantity: number
}

export interface RawEbayShippingFulfillment {
  fulfillmentId: string
  shipmentTrackingNumber?: string
  shippingCarrierCode?: string
  shippedDate?: string
  lineItems?: RawEbayFulfillmentLineItem[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * eBay fulfillments are created when the seller ships — if a fulfillment
 * record exists, it means the shipment has been initiated. We always
 * mark it as SUCCESS since eBay only creates fulfillments for shipped items.
 */
function inferStatus(raw: RawEbayShippingFulfillment): FulfillmentStatus {
  if (raw.shippedDate) return 'SUCCESS'
  return 'PENDING'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(
  orderId: string,
  raw: RawEbayShippingFulfillment,
): Fulfillment {
  const lineItems = (raw.lineItems ?? []).map((li) => ({
    lineItemId: li.lineItemId,
    quantity: li.quantity,
  }))

  return {
    id: raw.fulfillmentId,
    orderId,
    status: inferStatus(raw),
    trackingNumber: raw.shipmentTrackingNumber,
    carrier: raw.shippingCarrierCode,
    shippedAt: raw.shippedDate,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a fulfillment list from an eBay shipping_fulfillment array response.
 */
export function transformFulfillments(
  orderId: string,
  items: RawEbayShippingFulfillment[] | undefined,
): Fulfillment[] {
  if (!items || items.length === 0) return []
  return items.map((i) => transformFulfillment(orderId, i))
}

/**
 * Canonical Fulfillment → eBay create shipping_fulfillment body.
 */
export function untransformFulfillment(
  data: Partial<Fulfillment>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.trackingNumber) body['shipmentTrackingNumber'] = data.trackingNumber
  if (data.carrier) body['shippingCarrierCode'] = data.carrier
  if (data.shippedAt) body['shippedDate'] = data.shippedAt
  if (data.lineItems) {
    body['lineItems'] = data.lineItems.map((li) => ({
      lineItemId: li.lineItemId,
      quantity: li.quantity,
    }))
  }
  return body
}
