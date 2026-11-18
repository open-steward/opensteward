import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface Project44ShipmentResponse {
  id: string
  status?: string
  trackingNumber?: string
  carrierCode?: string
  mode?: string
  originCity?: string
  originState?: string
  originCountry?: string
  destinationCity?: string
  destinationState?: string
  destinationCountry?: string
  estimatedDeliveryDate?: string
  actualDeliveryDate?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface Project44ShipmentsListResponse {
  results: Project44ShipmentResponse[]
  [key: string]: unknown
}

function mapShipmentStatus(status: string | undefined): ShipmentStatus {
  switch (status) {
    case 'Info Received':
    case 'Picked Up':
      return 'PENDING'
    case 'In Transit':
      return 'IN_TRANSIT'
    case 'Out for Delivery':
      return 'OUT_FOR_DELIVERY'
    case 'Delivered':
      return 'DELIVERED'
    case 'Exception':
    case 'Delayed':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: Project44ShipmentResponse): Shipment {
  return {
    id: raw.id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: raw.carrierCode ?? 'project44',
    serviceCode: raw.mode ?? undefined,
    originAddress: raw.originCity
      ? {
          city: raw.originCity,
          state: raw.originState ?? undefined,
          country: raw.originCountry ?? undefined,
        }
      : undefined,
    destinationAddress: raw.destinationCity
      ? {
          city: raw.destinationCity,
          state: raw.destinationState ?? undefined,
          country: raw.destinationCountry ?? undefined,
        }
      : undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.actualDeliveryDate),
    createdAt: toISODate(raw.createdAt) ?? toISODate(new Date().toISOString()),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
