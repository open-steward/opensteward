/**
 * Allegro Shipment → canonical Fulfillment.
 *
 * Allegro's Order Management API exposes shipments per checkout form:
 *   GET /order/checkout-forms/{id}/shipments → list
 *   POST /order/shipments → create
 *
 * Each shipment has a carrier, waybill (tracking number), and creation date.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawAllegroLineItemShipment {
  id: string
}

export interface RawAllegroShipment {
  id: string
  waybill?: {
    id?: string
    carrierName?: string
    carrierId?: string
  }
  carrierId?: string
  carrierName?: string
  lineItems?: RawAllegroLineItemShipment[]
  createdAt?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Allegro shipments are created when the seller ships. If present with
 * a waybill, mark as SUCCESS; otherwise PENDING.
 */
function inferStatus(raw: RawAllegroShipment): FulfillmentStatus {
  if (raw.waybill?.id) return 'SUCCESS'
  return 'PENDING'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(
  orderId: string,
  raw: RawAllegroShipment,
): Fulfillment {
  const lineItems = (raw.lineItems ?? []).map((li) => ({
    lineItemId: li.id,
    quantity: 1,
  }))

  return {
    id: raw.id,
    orderId,
    status: inferStatus(raw),
    trackingNumber: raw.waybill?.id,
    carrier: raw.waybill?.carrierName ?? raw.carrierName,
    createdAt: raw.createdAt,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a fulfillment list from an Allegro shipments array response.
 */
export function transformFulfillments(
  orderId: string,
  items: RawAllegroShipment[] | undefined,
): Fulfillment[] {
  if (!items || items.length === 0) return []
  return items.map((i) => transformFulfillment(orderId, i))
}

/**
 * Canonical Fulfillment → Allegro create shipment body.
 */
export function untransformFulfillment(
  data: Partial<Fulfillment>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.orderId) body['checkoutFormId'] = data.orderId
  if (data.trackingNumber || data.carrier) {
    body['waybill'] = {
      id: data.trackingNumber,
      carrierName: data.carrier,
    }
  }
  if (data.lineItems) {
    body['lineItems'] = data.lineItems.map((li) => ({
      id: li.lineItemId,
    }))
  }
  return body
}
