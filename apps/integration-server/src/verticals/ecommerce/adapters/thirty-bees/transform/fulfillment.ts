/**
 * Thirty Bees Order Carrier → canonical Fulfillment.
 *
 * Thirty Bees is a fork of PrestaShop 1.6 with an identical webservice API.
 * Fulfillment/shipping info is tracked via `/api/order_carriers`. Each
 * order_carrier record carries tracking number, carrier id, and shipping date.
 * Thirty Bees has no native cancel-fulfillment operation.
 */

import type { Fulfillment } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawThirtyBeesOrderCarrier {
  id: number | string
  id_order?: number | string
  id_carrier?: number | string
  tracking_number?: string | null
  date_add?: string
  weight?: string | number | null
  shipping_cost_tax_incl?: string | number | null
  // Enriched by adapter:
  _carrier_name?: string
  [key: string]: unknown
}

export function transformFulfillment(raw: RawThirtyBeesOrderCarrier): Fulfillment {
  const hasTracking = raw.tracking_number != null && raw.tracking_number !== ''
  return {
    id: String(raw.id),
    orderId: raw.id_order != null ? String(raw.id_order) : '',
    status: hasTracking ? 'SUCCESS' : 'PENDING',
    trackingNumber: raw.tracking_number ?? undefined,
    carrier: raw._carrier_name ?? (raw.id_carrier != null ? String(raw.id_carrier) : undefined),
    shippedAt: hasTracking ? raw.date_add : undefined,
    createdAt: toIsoDatetime(raw.date_add),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → Thirty Bees order_carrier body. */
export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    id_order: fulfillment.orderId,
    id_carrier: fulfillment.carrier,
    tracking_number: fulfillment.trackingNumber,
  }
}
