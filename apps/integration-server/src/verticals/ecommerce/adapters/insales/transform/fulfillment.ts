/**
 * InSales does not expose a dedicated fulfillment resource in its REST API.
 * Fulfillment state is embedded on orders via `fulfillment_status` and
 * delivery fields. This module provides a synthetic transform that extracts
 * a fulfillment-like object from an InSales order's delivery information so
 * order-level fulfillment data can be surfaced via the canonical interface.
 *
 * Used by InsalesAdapter.listFulfillments / getFulfillment which synthesise
 * Fulfillment objects from order data.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

export interface RawInsalesFulfillmentInfo {
  /** InSales order id. */
  order_id: number | string
  /** InSales fulfillment_status value. */
  fulfillment_status?: string | null
  /** Tracking / waybill number from order fields. */
  tracking_number?: string | null
  /** Delivery service name. */
  delivery_title?: string | null
  delivered_at?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  new: 'PENDING',
  in_progress: 'OPEN',
  delivered: 'SUCCESS',
  cancelled: 'CANCELLED',
}

export function transformFulfillmentFromOrder(raw: RawInsalesFulfillmentInfo): Fulfillment {
  const status = raw.fulfillment_status?.toLowerCase()
  return {
    // Synthesise an id from the order id since InSales has no fulfillment id.
    id: `ful_order_${String(raw.order_id)}`,
    orderId: String(raw.order_id),
    status: status ? (STATUS_MAP[status] ?? undefined) : undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrier: raw.delivery_title ?? undefined,
    deliveredAt: raw.delivered_at ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
