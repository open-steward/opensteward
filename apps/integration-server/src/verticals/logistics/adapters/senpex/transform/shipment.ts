import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

/**
 * Canonical representation of a Senpex order as returned by:
 *   GET /orders/details/{order_id}
 *   GET /order-list
 *   PUT /orders/dropoff  (insert response uses inserted_id only — enriched via detail fetch)
 */
export interface SenpexOrder {
  id?: string | number | null
  order_name?: string | null
  status?: number | string | null
  pack_from_text?: string | null
  routes?: SenpexRoute[] | null
  order_price?: number | string | null
  order_price_currency?: string | null
  created_at?: string | null
  updated_at?: string | null
  taken_at?: string | null
  delivered_at?: string | null
  [key: string]: unknown
}

export interface SenpexRoute {
  id?: string | number | null
  route_to_text?: string | null
  rec_name?: string | null
  rec_phone?: string | number | null
  route_status?: number | null
  delivered_at?: string | null
  [key: string]: unknown
}

/**
 * Senpex order status IDs (numeric) and their canonical mappings.
 *
 * 1000 — Ready for delivery (Draft / waiting)
 * 1500 — Scheduled for delivery
 * 1550 — Courier assigned
 * 1590 — Arrived at pickup
 * 1630 — Picked up / in transit
 * 1670 — Arrived at drop-off
 * 1700 — Delivered
 *   -1 — Cancelled (string or numeric)
 */
function mapStatus(status: number | string | null | undefined): ShipmentStatus {
  const s = status != null ? Number(status) : NaN
  if (isNaN(s)) {
    const str = String(status ?? '').toLowerCase()
    if (str === 'cancelled' || str === 'canceled' || str === '-1') return 'CANCELLED'
    return 'UNKNOWN'
  }
  if (s === -1) return 'CANCELLED'
  if (s < 1500) return 'LABEL_CREATED'
  if (s < 1550) return 'PENDING'
  if (s < 1630) return 'IN_TRANSIT'
  if (s < 1700) return 'OUT_FOR_DELIVERY'
  if (s === 1700) return 'DELIVERED'
  return 'UNKNOWN'
}

export function transformShipment(raw: SenpexOrder): Shipment {
  const orderId = raw.id != null ? String(raw.id) : undefined
  const firstRoute = raw.routes?.[0] ?? null

  return {
    id: orderId,
    status: mapStatus(raw.status),
    trackingNumber: orderId,
    carrierId: 'senpex',
    serviceCode: 'senpex_delivery',
    originAddress: raw.pack_from_text
      ? { street1: raw.pack_from_text ?? undefined }
      : undefined,
    destinationAddress: firstRoute?.route_to_text
      ? {
          street1: firstRoute.route_to_text ?? undefined,
          name: firstRoute.rec_name != null ? String(firstRoute.rec_name) : undefined,
          phone: firstRoute.rec_phone != null ? String(firstRoute.rec_phone) : undefined,
        }
      : undefined,
    cost:
      raw.order_price != null
        ? {
            amount: Number(raw.order_price),
            currency: (raw.order_price_currency as string | undefined) ?? 'USD',
          }
        : undefined,
    reference: raw.order_name ?? undefined,
    actualDeliveryAt: toISODate(raw.delivered_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
