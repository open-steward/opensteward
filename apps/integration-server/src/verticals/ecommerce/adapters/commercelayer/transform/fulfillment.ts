/**
 * Commerce Layer Shipment → canonical Fulfillment.
 *
 * Commerce Layer auto-creates shipments from orders based on stock location
 * routing. Shipments have a status lifecycle:
 *   picking → packing → ready_to_ship → shipped → delivered (or on_hold / cancelled)
 *
 * Tracking is added via `PATCH /api/shipments/{id}` with tracking_number.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCLShipment {
  id: string
  number?: string
  status?: string
  currency_code?: string
  cost_amount_cents?: number
  cost_amount_float?: number
  tracking_number?: string | null
  tracking_url?: string | null
  // Shipping method name
  shipping_method_name?: string | null
  created_at?: string
  updated_at?: string
  shipped_at?: string | null
  delivered_at?: string | null
  on_hold_at?: string | null
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(status: string | undefined): FulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'picking':
    case 'packing':
      return 'PENDING'
    case 'ready_to_ship':
      return 'OPEN'
    case 'shipped':
      return 'SUCCESS'
    case 'delivered':
      return 'SUCCESS'
    case 'on_hold':
      return 'PENDING'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

export function transformFulfillment(raw: RawCLShipment): Fulfillment {
  const rels = raw._relationships as Record<string, { data?: { id: string } | null }> | undefined
  return {
    id: raw.id,
    orderId: rels?.['order']?.data?.id ?? '',
    status: mapStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    trackingUrl: raw.tracking_url ?? undefined,
    carrier: raw.shipping_method_name ?? undefined,
    locationId: rels?.['stock_location']?.data?.id,
    shippedAt: toIsoDatetime(raw.shipped_at),
    deliveredAt: toIsoDatetime(raw.delivered_at),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    data: {
      type: 'shipments',
      attributes: {
        tracking_number: fulfillment.trackingNumber,
      },
    },
  }
}
