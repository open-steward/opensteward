/**
 * EverShop Shipment → canonical Fulfillment.
 *
 * EverShop creates fulfillments (called "shipments") via
 * `POST /api/orders/{order_uuid}/shipments` and updates them via
 * `PATCH /api/orders/{order_uuid}/shipments/{shipment_uuid}`.
 *
 * Docs: https://evershop.io/docs/api/order
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawEverShopShipment {
  shipment_id?: number | string
  uuid?: string
  shipment_order_id?: number | string | null
  /** Order UUID, set by the adapter before passing here. */
  order_uuid?: string | null
  carrier_name?: string | null
  tracking_number?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(_raw: RawEverShopShipment): FulfillmentStatus {
  // EverShop shipments don't have an explicit status field; existence implies SUCCESS.
  return 'SUCCESS'
}

export function transformFulfillment(raw: RawEverShopShipment): Fulfillment {
  const id = raw.uuid ?? (raw.shipment_id != null ? String(raw.shipment_id) : '')
  const orderId = raw.order_uuid ?? (raw.shipment_order_id != null ? String(raw.shipment_order_id) : '')

  return {
    id,
    orderId,
    status: mapStatus(raw),
    trackingNumber: raw.tracking_number ?? undefined,
    carrier: raw.carrier_name ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → EverShop shipment body (for create/update). */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    carrier: fulfillment.carrier,
    tracking_number: fulfillment.trackingNumber,
  }
}
