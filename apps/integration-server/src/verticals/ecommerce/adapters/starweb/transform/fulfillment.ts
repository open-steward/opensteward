/**
 * Starweb Order shipping data → canonical Fulfillment.
 *
 * Starweb does not expose a dedicated fulfillment resource. Shipment
 * tracking information lives directly on the order:
 *   - `shippingTrackingNo` → trackingNumber
 *   - `shippingMethodName` → carrier
 *   - `isComplete`         → SUCCESS status when true
 *
 * We synthesise a single Fulfillment per order, using the orderId as the
 * fulfillment id as well (there is at most one shipment per order in
 * Starweb's data model).
 *
 * Docs: https://api-docs.starweb.se/
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

export interface RawStarwebOrderForFulfillment {
  orderId: number | string
  shippingTrackingNo?: string | null
  shippingMethodName?: string | null
  shippingMethodId?: number | null
  isComplete?: boolean
  createdAt?: string | null
  modifiedAt?: string | null
  [key: string]: unknown
}

export function transformFulfillment(raw: RawStarwebOrderForFulfillment): Fulfillment {
  const status: FulfillmentStatus = raw.isComplete === true ? 'SUCCESS' : 'OPEN'
  return {
    id: String(raw.orderId),
    orderId: String(raw.orderId),
    status,
    trackingNumber: raw.shippingTrackingNo ?? undefined,
    carrier: raw.shippingMethodName ?? undefined,
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.modifiedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment update → Starweb order PATCH body. */
export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    shippingTrackingNo: fulfillment.trackingNumber,
    isComplete: fulfillment.status === 'SUCCESS',
  }
}
