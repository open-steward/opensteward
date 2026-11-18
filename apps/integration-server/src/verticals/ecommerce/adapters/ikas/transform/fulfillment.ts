/**
 * ikas OrderPackage → canonical Fulfillment.
 *
 * ikas models fulfillments as "order packages". Each package can have a
 * tracking number and status.
 *
 * Package statuses: CREATED, PREPARING, READY, SHIPPED, DELIVERED, CANCELLED
 *
 * Mutations: updateOrderPackageStatus (update status + tracking), fulfillOrder
 *
 * Docs: https://ikas.dev/docs/api/admin-api/orders
 */

import type { Fulfillment, FulfillmentStatus, FulfillmentLineItem } from '../../../schema/fulfillment'

// ── Raw ikas shapes ───────────────────────────────────────────────────────────

export interface RawIkasTrackingInfo {
  trackingNumber?: string | null
  trackingUrl?: string | null
  shippingCompany?: string | null
}

export interface RawIkasPackageLineItem {
  orderLineItemId?: string | null
  quantity?: number | null
}

export interface RawIkasOrderPackage {
  id: string
  orderId?: string | null
  status?: string | null
  trackingInfo?: RawIkasTrackingInfo | null
  lines?: RawIkasPackageLineItem[] | null
  stockLocationId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  CREATED: 'PENDING',
  PREPARING: 'OPEN',
  READY: 'OPEN',
  SHIPPED: 'SUCCESS',
  DELIVERED: 'SUCCESS',
  CANCELLED: 'CANCELLED',
}

function mapLineItems(
  raw: RawIkasPackageLineItem[] | null | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw
    .filter((li) => li.orderLineItemId != null)
    .map((li) => ({
      lineItemId: li.orderLineItemId!,
      quantity: li.quantity ?? 1,
    }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawIkasOrderPackage, orderId?: string): Fulfillment {
  const status = raw.status ? STATUS_MAP[raw.status] ?? undefined : undefined
  return {
    id: raw.id,
    orderId: raw.orderId ?? orderId ?? '',
    status,
    trackingNumber: raw.trackingInfo?.trackingNumber ?? undefined,
    trackingUrl: raw.trackingInfo?.trackingUrl ?? undefined,
    carrier: raw.trackingInfo?.shippingCompany ?? undefined,
    locationId: raw.stockLocationId ?? undefined,
    lineItems: mapLineItems(raw.lines),
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → ikas updateOrderPackageStatus input. */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    trackingInfo: {
      trackingNumber: fulfillment.trackingNumber,
      trackingUrl: fulfillment.trackingUrl,
      shippingCompany: fulfillment.carrier,
    },
  }
}
