/**
 * JTL-Shop Fulfillment (Lieferung/Versand) → canonical Fulfillment.
 *
 * JTL-Shop fulfillments (shipments) are available under
 * `/api/v1/orders/{id}/shipments`. Key fields:
 *  - `id`, `orderId`
 *  - `status` — string ('pending', 'open', 'shipped', 'delivered', 'cancelled', 'error')
 *  - `trackingNumber`, `trackingUrl`, `carrier` (Versanddienstleister)
 *  - `service` — shipping service name
 *  - `items` array ({lineItemId, quantity})
 *  - `notifyCustomer` boolean
 *  - `shippedAt`, `estimatedDeliveryAt`, `deliveredAt` — ISO 8601
 *  - `created`, `modified` — ISO 8601 timestamps
 */

import type { Fulfillment, FulfillmentStatus, FulfillmentLineItem } from '../../../schema/fulfillment'

// ── Raw JTL-Shop shapes ───────────────────────────────────────────────────────

export interface RawJtlShopFulfillmentItem {
  lineItemId?: number | string | null
  quantity?: number
  [key: string]: unknown
}

export interface RawJtlShopFulfillment {
  id: number | string
  orderId?: number | string | null
  /** 'pending' | 'open' | 'shipped' | 'delivered' | 'cancelled' | 'error' | 'failure' */
  status?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  carrier?: string | null
  service?: string | null
  items?: RawJtlShopFulfillmentItem[]
  notifyCustomer?: boolean
  shippedAt?: string | null
  estimatedDeliveryAt?: string | null
  deliveredAt?: string | null
  created?: string | null
  modified?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  open: 'OPEN',
  shipped: 'SUCCESS',
  delivered: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  error: 'ERROR',
  failure: 'FAILURE',
}

function mapLineItems(
  raw: RawJtlShopFulfillmentItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: li.lineItemId != null ? String(li.lineItemId) : '',
    quantity: li.quantity ?? 0,
  }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawJtlShopFulfillment): Fulfillment {
  return {
    id: String(raw.id),
    orderId: raw.orderId != null ? String(raw.orderId) : '',
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    trackingUrl: raw.trackingUrl ?? undefined,
    carrier: raw.carrier ?? undefined,
    service: raw.service ?? undefined,
    lineItems: mapLineItems(raw.items),
    notifyCustomer: raw.notifyCustomer,
    shippedAt: raw.shippedAt ?? undefined,
    estimatedDeliveryAt: raw.estimatedDeliveryAt ?? undefined,
    deliveredAt: raw.deliveredAt ?? undefined,
    createdAt: raw.created ?? undefined,
    updatedAt: raw.modified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → JTL-Shop shipment body (for create/update). */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    trackingNumber: fulfillment.trackingNumber,
    trackingUrl: fulfillment.trackingUrl,
    carrier: fulfillment.carrier,
    service: fulfillment.service,
    notifyCustomer: fulfillment.notifyCustomer,
    items: fulfillment.lineItems?.map((li) => ({
      lineItemId: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
