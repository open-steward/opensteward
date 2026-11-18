/**
 * Swell shipment → canonical Fulfillment.
 *
 * Fields read, from the shipment model
 * (https://developers.swell.is/backend-api/shipments):
 *   id, order_id ("The id of the order this shipment was created for.",
 *   required), canceled ("Indicates the shipment was canceled."), draft
 *   ("Indicates the shipment is a draft."), carrier_name ("Name of a
 *   third-party carrier offering the service, if applicable."), service_name
 *   ("Name of the shipping service."), tracking_code, date_estimated,
 *   date_created, date_updated, origin.location ("ID of the origin location,
 *   if applicable."), items[] { order_item_id ("ID of the order item
 *   shipped."), quantity ("Quantity of the item shipped. Defaults to 1.") }.
 *
 * The model documents no tracking URL, ship date or delivery date, and no
 * status beyond `canceled` and `draft`, so a shipment that is neither has no
 * status. An item without `order_item_id` (the documented example has
 * `"order_item_id": null`) names no order line and is left out of
 * `lineItems`; it stays in `metadata`.
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawSwellShipmentItem {
  id?: string
  order_item_id?: string | null
  product_id?: string | null
  variant_id?: string | null
  quantity?: number | null
  [key: string]: unknown
}

export interface RawSwellShipment {
  id: string
  order_id?: string | null
  tracking_code?: string | null
  carrier_name?: string | null
  service_name?: string | null
  origin?: { location?: string | null } | null
  items?: RawSwellShipmentItem[] | null
  date_created?: string | null
  date_updated?: string | null
  date_estimated?: string | null
  canceled?: boolean | null
  draft?: boolean | null
  [key: string]: unknown
}

function mapStatus(raw: RawSwellShipment): FulfillmentStatus | undefined {
  if (raw.canceled === true) return 'CANCELLED'
  if (raw.draft === true) return 'PENDING'
  return undefined
}

function mapLineItems(
  raw: RawSwellShipmentItem[] | null | undefined,
): FulfillmentLineItem[] | undefined {
  const out: FulfillmentLineItem[] = []
  for (const li of raw ?? []) {
    if (!li.order_item_id) continue
    out.push({ lineItemId: li.order_item_id, quantity: li.quantity ?? 1 })
  }
  return out.length > 0 ? out : undefined
}

export function transformFulfillment(raw: RawSwellShipment): Fulfillment {
  if (!raw.order_id) {
    throw new Error(`Swell shipment ${raw.id} has no order_id`)
  }
  return {
    id: raw.id,
    orderId: raw.order_id,
    status: mapStatus(raw),
    trackingNumber: raw.tracking_code ?? undefined,
    carrier: raw.carrier_name ?? undefined,
    service: raw.service_name ?? undefined,
    locationId: raw.origin?.location ?? undefined,
    lineItems: mapLineItems(raw.items),
    estimatedDeliveryAt: raw.date_estimated ?? undefined,
    createdAt: raw.date_created ?? undefined,
    updatedAt: raw.date_updated ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (fulfillment.trackingNumber !== undefined) body['tracking_code'] = fulfillment.trackingNumber
  if (fulfillment.trackingUrl !== undefined) body['tracking_url'] = fulfillment.trackingUrl
  if (fulfillment.carrier !== undefined) body['carrier_name'] = fulfillment.carrier
  if (fulfillment.service !== undefined) body['service_name'] = fulfillment.service
  if (fulfillment.lineItems) {
    body['items'] = fulfillment.lineItems.map((li) => ({
      order_item_id: li.lineItemId,
      quantity: li.quantity,
    }))
  }
  return body
}
