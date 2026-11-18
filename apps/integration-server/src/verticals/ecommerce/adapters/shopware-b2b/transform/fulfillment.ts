/**
 * Shopware B2B Suite Order Delivery → canonical Fulfillment.
 *
 * Identical to base Shopware 6 — B2B Suite does not modify deliveries.
 */

import type {
  Fulfillment,
  FulfillmentLineItem,
  FulfillmentStatus,
} from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawShopwareDeliveryPosition {
  id?: string
  orderLineItemId?: string
  quantity?: number
  [key: string]: unknown
}

export interface RawShopwareOrderDelivery {
  id: string
  orderId: string
  trackingCodes?: string[]
  shippingMethod?: { name?: string; id?: string }
  stateMachineState?: { technicalName?: string; name?: string }
  positions?: RawShopwareDeliveryPosition[]
  shippingDateEarliest?: string | null
  shippingDateLatest?: string | null
  createdAt?: string
  updatedAt?: string | null
  [key: string]: unknown
}

function mapStatus(
  technicalName: string | undefined,
): FulfillmentStatus | undefined {
  switch (technicalName) {
    case 'open':
      return 'PENDING'
    case 'shipped':
      return 'SUCCESS'
    case 'shipped_partially':
      return 'OPEN'
    case 'returned':
    case 'returned_partially':
      return 'CANCELLED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

function mapLineItems(
  raw: RawShopwareDeliveryPosition[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((p) => ({
    lineItemId: p.orderLineItemId ?? p.id ?? '',
    quantity: p.quantity ?? 0,
  }))
}

export function transformFulfillment(raw: RawShopwareOrderDelivery): Fulfillment {
  const firstTrackingCode = raw.trackingCodes?.[0]
  return {
    id: raw.id,
    orderId: raw.orderId,
    status: mapStatus(raw.stateMachineState?.technicalName),
    trackingNumber: firstTrackingCode,
    carrier: raw.shippingMethod?.name ?? undefined,
    lineItems: mapLineItems(raw.positions),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    trackingCodes: fulfillment.trackingNumber ? [fulfillment.trackingNumber] : [],
  }
}
