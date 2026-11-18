/**
 * Square Order Fulfillment → canonical Fulfillment.
 *
 * Fulfillments in Square are nested within Orders as `fulfillments[]`.
 * Each has a `uid` (not a top-level id). The canonical id is a composite
 * `{orderId}:{fulfillmentUid}`.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

export interface RawSquareFulfillmentEntry {
  uid: string
  type?: string // PICKUP | SHIPMENT | DELIVERY | DIGITAL
  state?: string // PROPOSED | RESERVED | PREPARED | COMPLETED | CANCELED | FAILED
  pickup_details?: Record<string, unknown>
  shipment_details?: {
    carrier?: string
    tracking_number?: string
    tracking_url?: string
    shipping_note?: string
    placed_at?: string
    shipped_at?: string
    expected_shipped_at?: string
    canceled_at?: string
    delivered_at?: string
    [key: string]: unknown
  }
  line_item_application?: string
  entries?: Array<{ line_item_uid?: string; quantity?: string }>
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  PROPOSED: 'PENDING',
  RESERVED: 'OPEN',
  PREPARED: 'OPEN',
  COMPLETED: 'SUCCESS',
  CANCELED: 'CANCELLED',
  FAILED: 'FAILURE',
}

export function transformFulfillment(
  raw: RawSquareFulfillmentEntry,
  orderId: string,
): Fulfillment {
  const shipment = raw.shipment_details
  const lineItems = (raw.entries ?? [])
    .filter((e) => e.line_item_uid)
    .map((e) => ({
      lineItemId: e.line_item_uid!,
      quantity: e.quantity ? parseInt(e.quantity, 10) : 1,
    }))

  return {
    id: `${orderId}:${raw.uid}`,
    orderId,
    status: raw.state ? STATUS_MAP[raw.state.toUpperCase()] ?? undefined : undefined,
    trackingNumber: shipment?.tracking_number ?? undefined,
    trackingUrl: shipment?.tracking_url ?? undefined,
    carrier: shipment?.carrier ?? undefined,
    service: raw.type ?? undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippedAt: shipment?.shipped_at ?? undefined,
    deliveredAt: shipment?.delivered_at ?? undefined,
    createdAt: shipment?.placed_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → Square fulfillment entry for order update. */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    type: 'SHIPMENT',
    shipment_details: {
      carrier: fulfillment.carrier,
      tracking_number: fulfillment.trackingNumber,
      tracking_url: fulfillment.trackingUrl,
    },
  }
}
