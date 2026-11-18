/**
 * Salesforce Commerce Cloud (SCAPI) Shipment → canonical Fulfillment.
 *
 * SCAPI models fulfillments as "shipments" on an order.  Each shipment has:
 *   - `shipmentId`         → canonical `id`
 *   - `orderNo`            → canonical `orderId`
 *   - `shippingStatus`     → maps to canonical `FulfillmentStatus`
 *   - `trackingNumber`     → `trackingNumber`
 *   - `shippingMethod.id`  → `service`
 *
 * SCAPI shipments do not carry individual product line items in their shipment
 * document; products are on the order's `productItems`.  We surface the
 * shipment-level data only.
 *
 * Reference:
 *   Order shipments are embedded in the Order object returned by the Shopper Orders API.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw SCAPI shapes ──────────────────────────────────────────────────────────

export interface RawScapiShippingMethod {
  id?: string
  name?: string
}

export interface RawScapiShipment {
  shipmentId?: string
  orderNo?: string
  shippingStatus?: string | null
  trackingNumber?: string | null
  shippingMethod?: RawScapiShippingMethod | null
  shippingAddress?: unknown | null
  trackingUrl?: string | null
  shippedDate?: string | null
  estimatedDeliveryDate?: string | null
  [key: string]: unknown
}

// ── Status map ────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  not_shipped: 'PENDING',
  part_shipped: 'OPEN',
  shipped: 'SUCCESS',
  cancelled: 'CANCELLED',
  failed: 'FAILURE',
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformFulfillment(
  raw: RawScapiShipment,
  orderId?: string,
): Fulfillment {
  const status = raw.shippingStatus
    ? STATUS_MAP[raw.shippingStatus.toLowerCase()] ?? undefined
    : undefined
  return {
    id: raw.shipmentId ?? 'unknown',
    orderId: raw.orderNo ?? orderId ?? 'unknown',
    status,
    trackingNumber: raw.trackingNumber ?? undefined,
    trackingUrl: raw.trackingUrl ?? undefined,
    service: raw.shippingMethod?.id ?? raw.shippingMethod?.name ?? undefined,
    shippedAt: toIsoDatetime(raw.shippedDate),
    estimatedDeliveryAt: toIsoDatetime(raw.estimatedDeliveryDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
