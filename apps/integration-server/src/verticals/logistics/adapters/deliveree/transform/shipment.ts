import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, parseDecimal } from '../../shared/transform'
import { transformLocation, type DelivereeLocation } from './location'

export interface DelivereeVehicleTypeInfo {
  id?: number | null
  name?: string | null
  [key: string]: unknown
}

export interface DelivereeDelivery {
  id?: number | null
  status?: string | null
  job_order_number?: string | null
  tracking_url?: string | null
  total_fees?: number | null
  currency?: string | null
  vehicle_type_id?: number | null
  vehicle_type_info?: DelivereeVehicleTypeInfo | null
  locations?: DelivereeLocation[] | null
  created_at?: string | null
  pickup_time?: string | null
  completed_at?: string | null
  driver_id?: number | null
  customer_id?: number | null
  [key: string]: unknown
}

function mapDeliveryStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'locating_driver':
      return 'PENDING'
    case 'driver_accept_booking':
      return 'LABEL_CREATED'
    case 'delivery_in_progress':
      return 'IN_TRANSIT'
    case 'delivery_complete':
      return 'DELIVERED'
    case 'canceled':
      return 'CANCELLED'
    case 'locating_driver_timeout':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export function transformDelivery(raw: DelivereeDelivery): Shipment {
  const locations = raw.locations ?? []
  const origin = locations[0] ?? undefined
  const destination = locations[locations.length - 1] ?? undefined

  const totalFees = parseDecimal(raw.total_fees)

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapDeliveryStatus(raw.status),
    reference: raw.job_order_number ?? undefined,
    carrierId: 'deliveree',
    serviceCode:
      raw.vehicle_type_info?.name != null
        ? String(raw.vehicle_type_info.name)
        : raw.vehicle_type_id != null
          ? String(raw.vehicle_type_id)
          : undefined,
    originAddress: transformLocation(origin),
    destinationAddress:
      destination !== origin ? transformLocation(destination) : undefined,
    labelUrl: raw.tracking_url ?? undefined,
    cost:
      totalFees !== undefined && raw.currency
        ? { amount: totalFees, currency: String(raw.currency) }
        : undefined,
    createdAt: toISODate(raw.created_at),
    actualDeliveryAt: toISODate(raw.completed_at),
    metadata: raw as Record<string, unknown>,
  }
}
