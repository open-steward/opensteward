/**
 * Mercado Libre Shipment → canonical Fulfillment.
 *
 * Mercado Libre's Shipments API exposes shipment details:
 *   GET /shipments/{shipmentId} → get
 *
 * Shipment IDs are referenced from orders via order.shipping.id.
 * Each shipment has tracking info, status, and receiver address.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawMeliShipment {
  id: number
  order_id?: number
  status: string
  substatus?: string
  tracking_number?: string | null
  tracking_method?: {
    id?: number
    name?: string
  }
  service_id?: number
  carrier_info?: string | null
  sender_id?: number
  receiver_id?: number
  date_created?: string
  last_updated?: string
  date_first_printed?: string | null
  status_history?: {
    date_shipped?: string
    date_delivered?: string
    date_cancelled?: string
    date_handling?: string
    date_ready_to_ship?: string
    date_returned?: string
  }
  shipping_option?: {
    name?: string
    carrier_id?: number
    shipping_method_id?: number
    estimated_delivery_time?: {
      date?: string
    }
  }
  order_cost?: number
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * ML shipment status → canonical FulfillmentStatus.
 * ML statuses: pending, handling, ready_to_ship, shipped, delivered,
 *              not_delivered, cancelled, returned_to_sender
 */
function mapStatus(status: string): FulfillmentStatus {
  switch (status) {
    case 'delivered':
      return 'SUCCESS'
    case 'shipped':
    case 'ready_to_ship':
    case 'handling':
      return 'OPEN'
    case 'pending':
      return 'PENDING'
    case 'cancelled':
    case 'returned_to_sender':
      return 'CANCELLED'
    case 'not_delivered':
      return 'FAILURE'
    default:
      return 'PENDING'
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawMeliShipment): Fulfillment {
  const carrier =
    raw.tracking_method?.name ?? raw.shipping_option?.name ?? undefined
  const history = raw.status_history

  return {
    id: String(raw.id),
    orderId: raw.order_id ? String(raw.order_id) : 'unknown',
    status: mapStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrier,
    shippedAt: history?.date_shipped,
    deliveredAt: history?.date_delivered,
    estimatedDeliveryAt: raw.shipping_option?.estimated_delivery_time?.date,
    createdAt: toIsoDatetime(raw.date_created),
    updatedAt: toIsoDatetime(raw.last_updated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a fulfillment list from a shipments array.
 */
export function transformFulfillments(
  items: RawMeliShipment[] | undefined,
): Fulfillment[] {
  if (!items || items.length === 0) return []
  return items.map(transformFulfillment)
}
