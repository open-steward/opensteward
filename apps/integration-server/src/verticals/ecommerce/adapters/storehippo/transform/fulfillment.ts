/**
 * StoreHippo `ms.fulfillments` record → canonical Fulfillment.
 *
 * Fields, from the ms-fulfillments reference
 * (https://help.storehippo.com/api/reference/ms-fulfillments):
 *   fid              "The id of the fulfillment." (ex OID123-F1)
 *   order_id         "The record id of the associated orders."
 *   status           "Status of the fulfillment." (ex "Pending, Shipped, Fulfilled or Cancelled")
 *   items[]          name, variant_id, price, quantity "Quantity of product item."
 *   tracking_company "Logistics provider used to ship the fulfillment."
 *   service          string
 *   tracking_number  "Tracking number of the shipment associated with the fulfillment."
 *   shipment_id      "Record id of the shipment associated with the fulfillment (if any)."
 *   delivered_on     datetime
 * `_id`, `created_on`, `updated_on` and each item's `_id` (the order item's
 * `_id`) are in the documented "Retrieves a list of fulfillments" example.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { count, recordId, text } from '../values'

export interface RawStoreHippoFulfillmentItem {
  _id?: string
  name?: string
  variant_id?: string | null
  price?: string
  quantity?: string | number
  [key: string]: unknown
}

export interface RawStoreHippoFulfillment {
  _id?: string
  fid?: string
  order_id?: string
  status?: string
  items?: RawStoreHippoFulfillmentItem[]
  tracking_company?: string
  service?: string
  tracking_number?: string
  shipment_id?: string
  delivered_on?: string
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

function mapStatus(v: unknown): FulfillmentStatus | undefined {
  if (typeof v !== 'string' || v === '') return undefined
  switch (v.toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'shipped':
      return 'OPEN'
    case 'fulfilled':
      return 'SUCCESS'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

export function transformFulfillment(raw: RawStoreHippoFulfillment): Fulfillment {
  const id = recordId(raw, 'fulfillment')
  const orderId = text(raw.order_id)
  if (!orderId) throw new Error(`StoreHippo fulfillment ${id} has no order_id`)
  const status = mapStatus(raw.status)
  const lineItems = Array.isArray(raw.items)
    ? raw.items.map((item) => {
        const lineItemId = text(item._id)
        const quantity = count(item.quantity)
        if (!lineItemId || quantity === undefined) {
          throw new Error(`StoreHippo fulfillment ${id} has an item without _id or quantity`)
        }
        return { lineItemId, quantity }
      })
    : undefined
  return {
    id,
    orderId,
    ...(status ? { status } : {}),
    ...(text(raw.tracking_number) ? { trackingNumber: raw.tracking_number } : {}),
    ...(text(raw.tracking_company) ? { carrier: raw.tracking_company } : {}),
    ...(text(raw.service) ? { service: raw.service } : {}),
    ...(text(raw.shipment_id) ? { shipmentId: raw.shipment_id } : {}),
    ...(lineItems && lineItems.length > 0 ? { lineItems } : {}),
    ...(text(raw.delivered_on) ? { deliveredAt: raw.delivered_on } : {}),
    ...(text(raw.created_on) ? { createdAt: raw.created_on } : {}),
    ...(text(raw.updated_on) ? { updatedAt: raw.updated_on } : {}),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → StoreHippo shipment body for create. */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    orderId: fulfillment.orderId,
    carrier: fulfillment.carrier,
    trackingNumber: fulfillment.trackingNumber,
    trackingUrl: fulfillment.trackingUrl,
    service: fulfillment.service,
    notifyCustomer: fulfillment.notifyCustomer,
    items: fulfillment.lineItems?.map((li) => ({
      lineItemId: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
