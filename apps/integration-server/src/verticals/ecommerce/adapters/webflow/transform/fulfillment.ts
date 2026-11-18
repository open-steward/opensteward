/**
 * Webflow Fulfillment → canonical Fulfillment.
 *
 * Webflow orders can be fulfilled via PATCH /sites/{siteId}/orders/{orderId}/fulfill.
 * The response includes a `fulfilledOn` timestamp on the order itself.
 * Webflow does not have a dedicated fulfillments list — the adapter
 * synthesises fulfillment records from order data.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

export interface RawWebflowFulfillment {
  id?: string
  orderId: string
  status?: string
  trackingNumber?: string
  trackingUrl?: string
  carrier?: string
  createdOn?: string
  fulfilledOn?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | undefined): FulfillmentStatus | undefined {
  if (!status) return undefined
  const s = status.toLowerCase()
  if (s === 'fulfilled') return 'SUCCESS'
  if (s === 'pending') return 'PENDING'
  if (s === 'cancelled' || s === 'canceled') return 'CANCELLED'
  return 'PENDING'
}

export function transformFulfillment(raw: RawWebflowFulfillment): Fulfillment {
  return {
    id: raw.id ?? raw.orderId,
    orderId: raw.orderId,
    status: mapStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    trackingUrl: raw.trackingUrl ?? undefined,
    carrier: raw.carrier ?? undefined,
    shippedAt: raw.fulfilledOn ?? undefined,
    createdAt: raw.createdOn,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    sendOrderFulfilledEmail: fulfillment.notifyCustomer ?? false,
  }
}
