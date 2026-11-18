import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, parseDecimal } from '../../shared/transform'
import { transformLocation, type TransportifyLocation } from './address'

/**
 * Canonical Transportify delivery (booking) response object.
 * Maps to the GET /public_api/v10/deliveries/{id} response.
 */
export interface TransportifyDelivery {
  id: number | string
  status: string | null
  note: string | null
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
  tracking_url: string | null
  // First element is pickup, remaining are dropoffs
  locations: TransportifyLocation[] | null
  driver?: {
    id: number | null
    name: string | null
    phone: string | null
  } | null
  [key: string]: unknown
}

function mapDeliveryStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'locating_driver':         return 'PENDING'
    case 'driver_accept_booking':   return 'LABEL_CREATED'
    case 'delivery_in_progress':    return 'IN_TRANSIT'
    case 'delivery_complete':       return 'DELIVERED'
    case 'canceled':                return 'CANCELLED'
    case 'locating_driver_timeout': return 'EXCEPTION'
    default:                        return 'UNKNOWN'
  }
}

export function transformShipment(raw: TransportifyDelivery): Shipment {
  const locations = raw.locations ?? []
  const pickup = locations[0] ?? null
  const dropoff = locations.length > 1 ? locations[locations.length - 1] : null

  const totalFees = parseDecimal(raw.total_fees)

  return {
    id: String(raw.id),
    status: mapDeliveryStatus(raw.status),
    carrierId: 'transportify',
    serviceCode: raw.vehicle_type_name ?? (raw.vehicle_type_id != null ? String(raw.vehicle_type_id) : undefined),
    originAddress: transformLocation(pickup),
    destinationAddress: transformLocation(dropoff),
    cost:
      totalFees !== undefined
        ? {
            amount: totalFees,
            currency: raw.currency ?? 'PHP',
          }
        : undefined,
    reference: raw.job_order_number ?? undefined,
    notes: raw.note ?? undefined,
    estimatedDeliveryAt: toISODate(raw.pickup_time),
    actualDeliveryAt: toISODate(raw.completed_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
