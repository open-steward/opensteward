/**
 * Shopgate FulfillmentOrder → canonical Fulfillment.
 *
 * Shopgate models fulfillments as "fulfillment orders" on the Order Service.
 * They are identified by `orderNumber` and associated with a parent sales
 * order via `salesOrderNumber`.
 */

import type { Fulfillment, FulfillmentStatus, FulfillmentLineItem } from '../../../schema/fulfillment'

// ── Raw Shopgate shapes ───────────────────────────────────────────────────────

export interface RawShopgateFulfillmentLineItem {
  id?: string | null
  quantity?: number
  productCode?: string | null
  variantCode?: string | null
}

export interface RawShopgateTracking {
  tracking?: string | null
  trackingUrl?: string | null
  carrier?: string | null
}

export interface RawShopgateFulfillmentOrder {
  orderNumber: string
  salesOrderNumber?: string | null
  status?: string | null
  fulfillmentLocationCode?: string | null
  tracking?: RawShopgateTracking | null
  lineItems?: RawShopgateFulfillmentLineItem[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  open: 'OPEN',
  in_progress: 'OPEN',
  pending: 'PENDING',
  fulfilled: 'SUCCESS',
  success: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  error: 'ERROR',
  failed: 'FAILURE',
  failure: 'FAILURE',
}

function mapLineItems(
  raw: RawShopgateFulfillmentLineItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: li.id ?? `${li.productCode ?? ''}:${li.variantCode ?? ''}`,
    quantity: li.quantity ?? 1,
  }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawShopgateFulfillmentOrder): Fulfillment {
  return {
    id: raw.orderNumber,
    orderId: raw.salesOrderNumber ?? raw.orderNumber,
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    trackingNumber: raw.tracking?.tracking ?? undefined,
    trackingUrl: raw.tracking?.trackingUrl ?? undefined,
    carrier: raw.tracking?.carrier ?? undefined,
    locationId: raw.fulfillmentLocationCode ?? undefined,
    lineItems: mapLineItems(raw.lineItems),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → Shopgate fulfillment order body (create/update). */
export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    salesOrderNumber: fulfillment.orderId,
    fulfillmentLocationCode: fulfillment.locationId,
    tracking: fulfillment.trackingNumber
      ? {
          tracking: fulfillment.trackingNumber,
          trackingUrl: fulfillment.trackingUrl,
          carrier: fulfillment.carrier,
        }
      : undefined,
    lineItems: fulfillment.lineItems?.map((li) => ({
      id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
