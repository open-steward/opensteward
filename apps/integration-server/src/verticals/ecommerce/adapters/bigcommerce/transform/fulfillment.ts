/**
 * BigCommerce Shipment → canonical Fulfillment.
 *
 * BigCommerce calls fulfillments "shipments" and they live on the v2 API:
 * `/v2/orders/{id}/shipments`.
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawBigCommerceShipmentItem {
  order_product_id: number | string
  product_id?: number | string
  quantity: number
}

export interface RawBigCommerceShipment {
  id: number | string
  order_id: number | string
  tracking_number?: string | null
  tracking_link?: string | null
  shipping_method?: string | null
  shipping_provider?: string | null
  comments?: string | null
  items?: RawBigCommerceShipmentItem[]
  date_created?: string
  [key: string]: unknown
}

function mapLineItems(
  raw: RawBigCommerceShipmentItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: String(li.order_product_id),
    quantity: li.quantity,
  }))
}

export function transformFulfillment(raw: RawBigCommerceShipment): Fulfillment {
  // BigCommerce shipments don't have a status field — once created they
  // represent successful fulfillment.
  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    status: 'SUCCESS' as FulfillmentStatus,
    trackingNumber: raw.tracking_number ?? undefined,
    trackingUrl: raw.tracking_link ?? undefined,
    carrier: raw.shipping_provider ?? undefined,
    service: raw.shipping_method ?? undefined,
    lineItems: mapLineItems(raw.items),
    createdAt: raw.date_created,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    tracking_number: fulfillment.trackingNumber,
    tracking_link: fulfillment.trackingUrl,
    shipping_provider: fulfillment.carrier,
    shipping_method: fulfillment.service,
    comments: undefined,
    items: fulfillment.lineItems?.map((li) => ({
      order_product_id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
