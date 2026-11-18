/**
 * Ecwid Fulfillment transform.
 *
 * Ecwid models fulfillments as shipping tracking information on orders.
 * Each order has at most one shipment. We synthesize a Fulfillment from
 * the order's fulfillmentStatus and tracking fields.
 *
 * Endpoint:
 *   GET /api/v3/{storeId}/orders/{orderId}   (fulfillment info embedded in order)
 *
 * Key fields (from order):
 *   - `orderNumber` / `id`          → id
 *   - `fulfillmentStatus`           → status
 *   - `trackingNumber`              → trackingNumber
 *   - `shippingTrackingCode`        → trackingNumber (alternative)
 *   - `shippingCarrierName`         → carrier
 *   - `shippingOption.shippingCarrierName` → carrier
 *   - `shippingOption.shippingMethodName`  → service
 *   - `updateDate` / `createDate`   → shippedAt / createdAt
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

export interface RawEcwidFulfillment {
  /** Ecwid order id or orderNumber used as the fulfillment id */
  id?: number | string
  orderNumber?: number | string
  orderId?: number | string
  fulfillmentStatus?: string
  trackingNumber?: string
  shippingTrackingCode?: string
  shippingCarrierName?: string
  shippingOption?: {
    shippingCarrierName?: string
    shippingMethodName?: string
    shippingRate?: number
    [key: string]: unknown
  }
  items?: Array<{ id?: number | string; productId?: number | string; quantity?: number; [key: string]: unknown }>
  createDate?: string
  updateDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): FulfillmentStatus | undefined {
  switch ((s ?? '').toUpperCase()) {
    case 'AWAITING_PROCESSING':
    case 'PROCESSING':               return 'PENDING'
    case 'SHIPPED':                  return 'OPEN'
    case 'DELIVERED':                return 'SUCCESS'
    case 'WILL_NOT_DELIVER':
    case 'RETURNED':                 return 'CANCELLED'
    case 'READY_FOR_PICKUP':         return 'OPEN'
    default:                         return undefined
  }
}

export function transformFulfillment(raw: RawEcwidFulfillment): Fulfillment {
  const id = String(raw.id ?? raw.orderNumber ?? '')
  const orderId = String(raw.orderId ?? raw.id ?? raw.orderNumber ?? '')
  const trackingNumber = raw.trackingNumber ?? raw.shippingTrackingCode ?? undefined
  const carrier = raw.shippingCarrierName ?? raw.shippingOption?.shippingCarrierName ?? undefined
  const service = raw.shippingOption?.shippingMethodName ?? undefined

  return {
    id,
    orderId,
    status: mapStatus(raw.fulfillmentStatus),
    trackingNumber,
    carrier,
    service,
    lineItems: (raw.items ?? []).length > 0
      ? (raw.items ?? []).map((item) => ({
          lineItemId: String(item.id ?? ''),
          quantity: item.quantity ?? 1,
        }))
      : undefined,
    createdAt: raw.createDate ?? undefined,
    updatedAt: raw.updateDate ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
