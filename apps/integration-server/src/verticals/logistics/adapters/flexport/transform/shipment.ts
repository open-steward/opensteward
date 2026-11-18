import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface FlexportShipmentResponse {
  id: string
  status: string
  name?: string
  freight_type?: string
  transportation_mode?: string
  incoterm?: string
  cargo_ready_date?: string
  delivered_in_full_date?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface FlexportShipmentsListResponse {
  data: FlexportShipmentResponse[]
  [key: string]: unknown
}

function mapShipmentStatus(status: string | undefined): ShipmentStatus {
  switch (status) {
    case 'booked':
    case 'confirmed':
      return 'PENDING'
    case 'in_transit':
      return 'IN_TRANSIT'
    case 'arrived':
      return 'IN_TRANSIT'
    case 'delivered':
      return 'DELIVERED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: FlexportShipmentResponse): Shipment {
  return {
    id: String(raw.id),
    status: mapShipmentStatus(raw.status),
    carrierId: 'flexport',
    serviceCode: raw.transportation_mode ?? undefined,
    reference: raw.name ?? undefined,
    estimatedDeliveryAt: toISODate(raw.delivered_in_full_date),
    createdAt: toISODate(raw.created_at) ?? toISODate(new Date().toISOString()),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
