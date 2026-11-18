/**
 * Wix Fulfillment → canonical Fulfillment.
 *
 * Wix fulfillments are nested under orders. Create via
 * `POST /ecom/v1/fulfillments/create`.
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawWixFulfillmentLineItem {
  id?: string
  quantity?: number
}

export interface RawWixFulfillment {
  id?: string
  orderId?: string
  status?: string
  trackingInfo?: {
    trackingNumber?: string
    trackingLink?: string
    shippingProvider?: string
  }
  lineItems?: RawWixFulfillmentLineItem[]
  createdDate?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  PENDING: 'PENDING',
  ACCEPTED: 'OPEN',
  READY_FOR_PICKUP: 'OPEN',
  FULFILLED: 'SUCCESS',
  CANCELLED: 'CANCELLED',
  CANCELED: 'CANCELLED',
}

function mapLineItems(
  raw: RawWixFulfillmentLineItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: li.id ?? '',
    quantity: li.quantity ?? 0,
  }))
}

export function transformFulfillment(
  raw: RawWixFulfillment,
  orderId?: string,
): Fulfillment {
  return {
    id: raw.id ?? '',
    orderId: raw.orderId ?? orderId ?? '',
    status: raw.status ? STATUS_MAP[raw.status.toUpperCase()] ?? undefined : undefined,
    trackingNumber: raw.trackingInfo?.trackingNumber || undefined,
    trackingUrl: raw.trackingInfo?.trackingLink || undefined,
    carrier: raw.trackingInfo?.shippingProvider || undefined,
    lineItems: mapLineItems(raw.lineItems),
    createdAt: raw.createdDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → Wix fulfillment body (for create). */
export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    orderId: fulfillment.orderId,
    lineItems: fulfillment.lineItems?.map((li) => ({
      id: li.lineItemId,
      quantity: li.quantity,
    })),
    trackingInfo: {
      trackingNumber: fulfillment.trackingNumber,
      trackingLink: fulfillment.trackingUrl,
      shippingProvider: fulfillment.carrier,
    },
  }
}
