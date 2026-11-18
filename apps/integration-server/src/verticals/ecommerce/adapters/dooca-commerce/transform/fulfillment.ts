/**
 * Dooca Commerce Fulfillment → canonical Fulfillment.
 *
 * Dooca fulfillment is a sub-resource of an order at
 * `/orders/:order_id/fulfillment`. Fulfillment progresses through states:
 *   attended → invoiced → shipped → delivered
 *
 * The fulfillment object is embedded in the order response under `fulfillment`.
 * For the canonical adapter, we treat each fulfillment status transition as
 * a fulfillment record keyed by the order id.
 *
 * Key fields:
 *   - `status` — "attended" | "invoiced" | "shipped" | "delivered"
 *   - `nfe_number`, `nfe_series` — Brazilian fiscal invoice fields
 *   - `shipping_code` — carrier tracking number
 *   - `shipping_track_url` — carrier tracking URL
 *   - `shipping_carrier` — carrier name
 *
 * Docs: https://docs.dooca.com.br/fulfillment/api
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawDoocaFulfillment {
  id?: number | string | null
  order_id: number | string
  status?: string | null           // attended | invoiced | shipped | delivered
  nfe_number?: string | null
  nfe_series?: string | null
  nfe_token?: string | null
  shipping_code?: string | null    // tracking number
  shipping_track_url?: string | null
  shipping_carrier?: string | null
  shipping_carrier_id?: number | string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  attended: 'OPEN',
  invoiced: 'OPEN',
  shipped: 'SUCCESS',
  delivered: 'SUCCESS',
}

export function transformFulfillment(raw: RawDoocaFulfillment): Fulfillment {
  return {
    id: raw.id != null ? String(raw.id) : String(raw.order_id),
    orderId: String(raw.order_id),
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    trackingNumber: raw.shipping_code ?? undefined,
    trackingUrl: raw.shipping_track_url ?? undefined,
    carrier: raw.shipping_carrier ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → Dooca fulfillment body (for create/update). */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    shipping_carrier: fulfillment.carrier,
    shipping_code: fulfillment.trackingNumber,
    shipping_track_url: fulfillment.trackingUrl,
  }
}
