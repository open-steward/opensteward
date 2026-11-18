/**
 * ManoMano Shipment → canonical Fulfillment.
 *
 * ManoMano exposes shipment (tracking) information as part of the order or
 * as a dedicated "shipment" sub-resource keyed by order id. The shape is:
 *
 *   {
 *     id: string,
 *     order_id: string,
 *     status: string,           // "PENDING"|"SHIPPED"|"DELIVERED"|"CANCELLED"
 *     carrier: string,
 *     tracking_number: string,
 *     tracking_url: string,
 *     order_lines: [{ id: string, quantity: number }],
 *     shipped_at: string | null,
 *     estimated_delivery_at: string | null,
 *     delivered_at: string | null,
 *     created_at: string,
 *     updated_at: string
 *   }
 *
 * Sellers POST to the shipment endpoint to register a tracking number for an
 * order. Only one active shipment per order is typical on ManoMano.
 *
 * Docs: https://www.manomano.dev/
 */

import type { Fulfillment, FulfillmentStatus, FulfillmentLineItem } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw ManoMano shapes ──────────────────────────────────────────────────────

export interface RawManomanoShipmentLine {
  id: string | number
  quantity: number
}

export interface RawManomanoShipment {
  id: string | number
  order_id: string | number
  status?: string | null
  carrier?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  order_lines?: RawManomanoShipmentLine[]
  shipped_at?: string | null
  estimated_delivery_at?: string | null
  delivered_at?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Status mapping ───────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  shipped: 'SUCCESS',
  delivered: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  error: 'ERROR',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapLineItems(
  raw: RawManomanoShipmentLine[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({ lineItemId: String(li.id), quantity: li.quantity }))
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawManomanoShipment): Fulfillment {
  const status = (raw.status ?? '').toLowerCase()
  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    status: STATUS_MAP[status] ?? undefined,
    carrier: raw.carrier ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    trackingUrl: raw.tracking_url ?? undefined,
    lineItems: mapLineItems(raw.order_lines),
    shippedAt: toIsoDatetime(raw.shipped_at),
    estimatedDeliveryAt: toIsoDatetime(raw.estimated_delivery_at),
    deliveredAt: toIsoDatetime(raw.delivered_at),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → ManoMano shipment body (for create/update). */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    carrier: fulfillment.carrier,
    tracking_number: fulfillment.trackingNumber,
    tracking_url: fulfillment.trackingUrl,
    order_lines: fulfillment.lineItems?.map((li) => ({
      id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
