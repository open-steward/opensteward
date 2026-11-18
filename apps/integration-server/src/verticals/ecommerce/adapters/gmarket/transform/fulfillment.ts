/**
 * Gmarket Shipment → canonical Fulfillment.
 *
 * Gmarket's seller API exposes fulfillments/shipments per order:
 *   GET /v1/fulfillments?orderNo={orderNo} → list
 *   GET /v1/fulfillments/{fulfillmentNo} → get
 *   POST /v1/fulfillments → create
 *
 * Each fulfillment has a tracking number, carrier, and shipped date.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawGmarketFulfillmentLineItem {
  orderItemNo: string
  quantity: number
}

export interface RawGmarketFulfillment {
  fulfillmentNo: string
  orderNo: string
  trackingNo?: string
  carrierCode?: string
  carrierName?: string
  shippedDate?: string
  deliveredDate?: string
  status?: string
  lineItems?: RawGmarketFulfillmentLineItem[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Gmarket fulfillment status → canonical.
 * Values: READY, SHIPPED, DELIVERED, CANCELLED
 */
function mapStatus(status: string | undefined): FulfillmentStatus {
  if (!status) return 'PENDING'
  switch (status) {
    case 'SHIPPED':
      return 'SUCCESS'
    case 'DELIVERED':
      return 'SUCCESS'
    case 'READY':
      return 'PENDING'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawGmarketFulfillment): Fulfillment {
  const lineItems = (raw.lineItems ?? []).map((li) => ({
    lineItemId: li.orderItemNo,
    quantity: li.quantity,
  }))

  return {
    id: raw.fulfillmentNo,
    orderId: raw.orderNo,
    status: mapStatus(raw.status),
    trackingNumber: raw.trackingNo,
    carrier: raw.carrierName ?? raw.carrierCode,
    shippedAt: raw.shippedDate,
    deliveredAt: raw.deliveredDate,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a fulfillment list from a Gmarket fulfillments array response.
 */
export function transformFulfillments(
  items: RawGmarketFulfillment[] | undefined,
): Fulfillment[] {
  if (!items || items.length === 0) return []
  return items.map((i) => transformFulfillment(i))
}

/**
 * Canonical Fulfillment → Gmarket create fulfillment body.
 */
export function untransformFulfillment(
  data: Partial<Fulfillment>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.orderId) body['orderNo'] = data.orderId
  if (data.trackingNumber) body['trackingNo'] = data.trackingNumber
  if (data.carrier) body['carrierCode'] = data.carrier
  if (data.shippedAt) body['shippedDate'] = data.shippedAt
  if (data.lineItems) {
    body['lineItems'] = data.lineItems.map((li) => ({
      orderItemNo: li.lineItemId,
      quantity: li.quantity,
    }))
  }
  return body
}
