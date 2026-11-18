import type { Order } from '../../../schema/order'
import { toISODate, parseDecimal, nonempty } from '../../shared/transform'
import { transformLocation, type TransportifyLocation } from './address'

/**
 * A Transportify delivery repurposed as an Order record.
 * Transportify doesn't have a distinct "order" concept — a booking IS the order.
 * We map the booking response to the canonical Order schema.
 */
export interface TransportifyOrderDelivery {
  id: number | string
  status: string | null
  job_order_number: string | null
  vehicle_type_id: number | null
  vehicle_type_name: string | null
  time_type: string | null
  pickup_time: string | null
  created_at: string | null
  updated_at: string | null
  completed_at: string | null
  canceled_at: string | null
  total_fees: number | null
  currency: string | null
  note: string | null
  locations: TransportifyLocation[] | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): Order['status'] {
  switch (status) {
    case 'locating_driver':         return 'PROCESSING'
    case 'driver_accept_booking':   return 'AWAITING_SHIPMENT'
    case 'delivery_in_progress':    return 'SHIPPED'
    case 'delivery_complete':       return 'DELIVERED'
    case 'canceled':                return 'CANCELLED'
    case 'locating_driver_timeout': return 'CANCELLED'
    default:                        return 'PENDING'
  }
}

export function transformOrder(raw: TransportifyOrderDelivery): Order {
  const locations = raw.locations ?? []
  const pickup = locations[0] ?? null
  const dropoff = locations.length > 1 ? locations[locations.length - 1] : null

  const totalFees = parseDecimal(raw.total_fees)

  return {
    id: String(raw.id),
    orderNumber: raw.job_order_number ?? undefined,
    status: mapOrderStatus(raw.status),
    originAddress: transformLocation(pickup),
    destinationAddress: transformLocation(dropoff),
    // In Transportify a booking maps to a single "shipment" (itself)
    shipmentIds: nonempty([String(raw.id)]),
    currency: (raw.currency as Order['currency']) ?? undefined,
    totalAmount: totalFees,
    notes: raw.note ?? undefined,
    requestedServiceCode: raw.vehicle_type_name ?? undefined,
    orderAt: toISODate(raw.pickup_time),
    shippedAt: toISODate(raw.pickup_time),
    deliveredAt: toISODate(raw.completed_at),
    cancelledAt: toISODate(raw.canceled_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
