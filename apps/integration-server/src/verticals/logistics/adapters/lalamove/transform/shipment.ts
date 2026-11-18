import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── Lalamove raw types ────────────────────────────────────────────────────

export interface LalamoveOrder {
  orderId: string
  status: string | null
  price_amount: number | null
  price_currency: string | null
  driver_name: string | null
  pickup_address: string | null
  delivery_address: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'ASSIGNING_DRIVER': return 'PENDING'
    case 'ON_GOING':         return 'IN_TRANSIT'
    case 'PICKED_UP':        return 'IN_TRANSIT'
    case 'COMPLETED':        return 'DELIVERED'
    case 'CANCELLED':        return 'CANCELLED'
    case 'EXPIRED':          return 'EXCEPTION'
    case 'REJECTED':         return 'EXCEPTION'
    default:                 return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: LalamoveOrder): Shipment {
  return {
    id: raw.orderId,
    status: mapShipmentStatus(raw.status),
    carrierId: 'lalamove',
    originAddress: raw.pickup_address
      ? { street1: raw.pickup_address }
      : undefined,
    destinationAddress: raw.delivery_address
      ? { street1: raw.delivery_address }
      : undefined,
    cost: raw.price_amount != null
      ? { amount: raw.price_amount, currency: raw.price_currency ?? 'USD' }
      : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
