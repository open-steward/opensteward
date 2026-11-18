/**
 * VNDA (WooCommerce-based) Order Fulfillment → canonical Fulfillment.
 *
 * VNDA exposes shipment / dispatch data through its REST API.
 * Fulfillments here are mapped from VNDA order shipment entries
 * (GET /orders/{id}/shipments or nested `shipments` on an order).
 * The canonical id is `{orderId}:{shipmentId}`.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

export interface RawVndaShipment {
  id?: number | string
  order_id?: number | string
  status?: string
  tracking_code?: string
  tracking_url?: string
  carrier?: string
  service?: string
  shipped_at?: string
  delivered_at?: string
  estimated_delivery_at?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined | null): FulfillmentStatus | undefined {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'delivered' || v === 'completed') return 'SUCCESS'
  if (v === 'cancelled' || v === 'canceled') return 'CANCELLED'
  if (v === 'failed' || v === 'failure' || v === 'error') return 'FAILURE'
  if (v === 'pending' || v === 'created') return 'PENDING'
  if (v === 'in_transit' || v === 'shipped' || v === 'dispatched' || v === 'open') return 'OPEN'
  return undefined
}

export function transformFulfillment(raw: RawVndaShipment, orderId: string): Fulfillment {
  const shipmentId = String(raw.id ?? '')
  return {
    id: `${orderId}:${shipmentId}`,
    orderId,
    status: mapStatus(raw.status),
    trackingNumber: raw.tracking_code ?? undefined,
    trackingUrl: raw.tracking_url ?? undefined,
    carrier: raw.carrier ?? undefined,
    service: raw.service ?? undefined,
    shippedAt: raw.shipped_at ?? undefined,
    estimatedDeliveryAt: raw.estimated_delivery_at ?? undefined,
    deliveredAt: raw.delivered_at ?? undefined,
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
