/**
 * Brink Commerce Delivery → canonical Fulfillment.
 *
 * Brink calls fulfillments "deliveries". Shapes are the OrderManagement
 * OpenAPI embedded in
 * https://docs.brinkcommerce.com/technical/api-references/order/deliveries.md:
 * `GET /orders/{orderId}/deliveries` returns `OrderDeliveries`
 * `{ deliveries: DeliveryDetails[] }` and `GET /deliveries/{deliveryId}` returns
 * `Delivery` (DeliveryDetails plus provider statuses). DeliveryDetails
 * requires id, orderId, orderReference, paymentProvider, orderLines,
 * shippingFees, gifts, giftCards, giftCardProducts, totals, created, updated,
 * revision; `tracking` is optional `DeliveryTracking`
 * { reference, url, shippingMethod, shippingCompany }.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw Brink Commerce shapes (documented fields only) ──────────────────────

/** `DeliveryOrderLine`: orderLineId and quantity (minimum 1) are required. */
export interface RawBrinkDeliveryOrderLine {
  orderLineId: string
  quantity: number
  [key: string]: unknown
}

/** `DeliveryTracking`. */
export interface RawBrinkDeliveryTracking {
  reference?: string
  url?: string
  shippingMethod?: string
  shippingCompany?: string
}

/** `DeliveryDetails` / `Delivery`. */
export interface RawBrinkDelivery {
  id: string
  orderId: string
  orderReference?: string
  orderLines: RawBrinkDeliveryOrderLine[]
  tracking?: RawBrinkDeliveryTracking
  created?: string
  updated?: string
  started?: string
  completed?: string
  failed?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * From the documented timestamps: "When the delivery failed", "When the
 * delivery was completed", "When the delivery started its provider actions".
 */
function mapStatus(delivery: RawBrinkDelivery): FulfillmentStatus {
  if (delivery.failed) return 'FAILURE'
  if (delivery.completed) return 'SUCCESS'
  if (delivery.started) return 'OPEN'
  return 'PENDING'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDelivery(raw: RawBrinkDelivery): Fulfillment {
  return {
    id: raw.id,
    orderId: raw.orderId,
    status: mapStatus(raw),
    trackingNumber: raw.tracking?.reference || undefined,
    trackingUrl: raw.tracking?.url || undefined,
    carrier: raw.tracking?.shippingCompany || undefined,
    service: raw.tracking?.shippingMethod || undefined,
    lineItems: raw.orderLines.map((l) => ({ lineItemId: l.orderLineId, quantity: l.quantity })),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → Brink delivery request body. */
export function untransformDelivery(data: Partial<Fulfillment>): Record<string, unknown> {
  return {
    trackingReference: data.trackingNumber,
    trackingUrl: data.trackingUrl,
    shippingCompany: data.carrier,
    shippingMethod: data.service,
    orderLines: data.lineItems?.map((li) => ({
      orderLineId: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
