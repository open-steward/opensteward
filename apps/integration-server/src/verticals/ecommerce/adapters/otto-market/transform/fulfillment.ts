/**
 * OTTO Market Shipment → canonical Fulfillment.
 *
 * Confirmed (`GET /v1/shipments/{shipmentId}`,
 * `GET /v1/shipments/carriers/{carrier}/trackingnumbers/{trackingNumber}`):
 * `shipmentId`, `creationDate`, `trackingKey.{carrier, trackingNumber}`.
 * The order a shipment belongs to is not shown in a worked JSON example on
 * the public docs page. `Fulfillment.orderId` is required and used for
 * joins downstream, so a placeholder like `'unknown'` would be worse than
 * no record at all — every such placeholder would collide on the same
 * fake id. `deriveOrderId` tries the plausible key spellings a shipment
 * record would carry a back-reference under, and THROWS (matching
 * `transform/refund.ts`'s `transformRefund`, which does the same for its
 * own required, undocumented-field id) when none is present, rather than
 * fabricate one. `index.ts` list callers let that propagate — a loud
 * per-page failure over a silently-corrupted join.
 *
 * `POST /v1/shipments` (create) and
 * `POST /v1/shipments/{shipmentId}/positionitems` (attach line items) exist
 * but the public docs page states only that they exist, with no worked
 * request-body example — `untransformFulfillment` maps the canonical fields
 * onto the same `trackingKey`/`positionItems` vocabulary the GET response
 * confirms, which is the natural body shape for this API but is inferred,
 * not verbatim from a spec.
 *
 * Docs: https://api.otto.market/docs/functional-interfaces/shipments
 */

import type { Fulfillment, FulfillmentLineItem } from '../../../schema/fulfillment'

export interface RawOttoTrackingKey {
  carrier?: string
  trackingNumber?: string
}

export interface RawOttoShipmentPositionItem {
  positionItemId: string
  quantity?: number
}

export interface RawOttoShipment {
  shipmentId: string
  creationDate?: string
  trackingKey?: RawOttoTrackingKey
  positionItems?: RawOttoShipmentPositionItem[]
  salesOrderId?: string
  orderId?: string
  orderNumber?: string
  [key: string]: unknown
}

function deriveOrderId(raw: RawOttoShipment): string {
  const orderId = raw.salesOrderId ?? raw.orderId ?? raw.orderNumber
  if (orderId == null) {
    throw new Error(
      `OTTO Market transformFulfillment: shipment ${raw.shipmentId} has none of ` +
        'salesOrderId/orderId/orderNumber — cannot build a stable Fulfillment.orderId from this payload.',
    )
  }
  return orderId
}

export function transformFulfillment(raw: RawOttoShipment): Fulfillment {
  const lineItems: FulfillmentLineItem[] | undefined = raw.positionItems?.map((pi) => ({
    lineItemId: pi.positionItemId,
    quantity: pi.quantity ?? 0,
  }))

  return {
    id: raw.shipmentId,
    orderId: deriveOrderId(raw),
    status: raw.shipmentId ? 'SUCCESS' : 'PENDING',
    trackingNumber: raw.trackingKey?.trackingNumber,
    carrier: raw.trackingKey?.carrier,
    lineItems,
    shippedAt: raw.creationDate,
    createdAt: raw.creationDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Fulfillment → OTTO Market create-shipment body. Field names are
 * inferred from the confirmed GET response vocabulary (`trackingKey`,
 * `positionItems`), not confirmed verbatim from a request-body example.
 */
export function untransformFulfillment(data: Partial<Fulfillment>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.carrier || data.trackingNumber) {
    body['trackingKey'] = {
      carrier: data.carrier,
      trackingNumber: data.trackingNumber,
    }
  }
  if (data.lineItems && data.lineItems.length > 0) {
    body['positionItems'] = data.lineItems.map((li) => ({
      positionItemId: li.lineItemId,
      quantity: li.quantity,
    }))
  }
  return body
}
