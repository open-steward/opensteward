/**
 * Magento Shipment → canonical Fulfillment.
 *
 * Magento shipments live under `/V1/shipments` and carry:
 *  - `tracks[]` — each track has `track_number`, `carrier_code`, `title`.
 *  - `items[]` — each item has `order_item_id` + `qty`.
 *
 * Magento shipments are immutable once created, so only list/get/create
 * are supported by the adapter. The canonical `status` always maps to
 * SUCCESS since Magento only represents already-shipped shipments.
 */

import type {
  Fulfillment,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawMagentoShipmentTrack {
  entity_id?: number
  track_number?: string
  title?: string
  carrier_code?: string
  order_id?: number
  parent_id?: number
  qty?: number
  description?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawMagentoShipmentItem {
  entity_id?: number
  order_item_id: number
  qty: number
  sku?: string
  name?: string
  price?: number
  row_total?: number
  weight?: number
  [key: string]: unknown
}

export interface RawMagentoShipment {
  entity_id: number
  order_id: number
  increment_id?: string
  total_qty?: number
  created_at?: string
  updated_at?: string
  shipment_status?: number | null
  tracks?: RawMagentoShipmentTrack[]
  items?: RawMagentoShipmentItem[]
  comments?: unknown[]
  [key: string]: unknown
}

function mapLineItems(
  raw: RawMagentoShipmentItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((it) => ({
    lineItemId: String(it.order_item_id),
    quantity: it.qty,
  }))
}

export function transformFulfillment(raw: RawMagentoShipment): Fulfillment {
  // Magento only records shipments that have actually shipped, so we
  // emit SUCCESS by default. If callers want tri-state, they can read
  // `shipment_status` from metadata.
  const firstTrack = raw.tracks?.[0]
  return {
    id: String(raw.entity_id),
    orderId: String(raw.order_id),
    status: 'SUCCESS',
    trackingNumber: firstTrack?.track_number,
    carrier: firstTrack?.carrier_code ?? firstTrack?.title,
    lineItems: mapLineItems(raw.items),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Fulfillment → Magento shipment create body. Magento's
 * create-shipment endpoint is `POST /V1/order/{orderId}/ship`:
 *
 *   { items: [{order_item_id, qty}],
 *     tracks: [{track_number, title, carrier_code}],
 *     notify: boolean }
 */
export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  const items =
    fulfillment.lineItems?.map((li) => ({
      order_item_id: Number(li.lineItemId),
      qty: li.quantity,
    })) ?? []
  const tracks = fulfillment.trackingNumber
    ? [
        {
          track_number: fulfillment.trackingNumber,
          title: fulfillment.carrier ?? 'Custom',
          carrier_code: fulfillment.carrier ?? 'custom',
        },
      ]
    : []
  return {
    items,
    tracks,
    notify: fulfillment.notifyCustomer ?? false,
  }
}
