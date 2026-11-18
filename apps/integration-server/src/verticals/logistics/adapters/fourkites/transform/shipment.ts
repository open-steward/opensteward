import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── FourKites raw types ───────────────────────────────────────────────────

export interface FourKitesLoad {
  loadId: string
  status: string | null
  trackingNumber: string | null
  carrierName: string | null
  mode: string | null
  originCity: string | null
  originState: string | null
  originCountry: string | null
  destinationCity: string | null
  destinationState: string | null
  destinationCountry: string | null
  estimatedDeliveryDate: string | null
  createdAt: string | null
  updatedAt: string | null
  [key: string]: unknown
}

export interface FourKitesLoadsResponse {
  loads: FourKitesLoad[]
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'DISPATCHED':          return 'PENDING'
    case 'PICKED_UP':           return 'PENDING'
    case 'IN_TRANSIT':          return 'IN_TRANSIT'
    case 'AT_STOP':             return 'IN_TRANSIT'
    case 'DELIVERED':           return 'DELIVERED'
    case 'DELAYED':             return 'EXCEPTION'
    case 'CANCELLED':           return 'CANCELLED'
    default:                    return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformShipment(raw: FourKitesLoad): Shipment {
  const hasOrigin = raw.originCity || raw.originState || raw.originCountry
  const hasDest = raw.destinationCity || raw.destinationState || raw.destinationCountry

  return {
    id: raw.loadId,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? raw.loadId ?? undefined,
    carrierId: raw.carrierName ?? 'fourkites',
    serviceCode: raw.mode ?? undefined,
    originAddress: hasOrigin
      ? {
          city: raw.originCity ?? undefined,
          state: raw.originState ?? undefined,
          country: raw.originCountry ?? undefined,
        }
      : undefined,
    destinationAddress: hasDest
      ? {
          city: raw.destinationCity ?? undefined,
          state: raw.destinationState ?? undefined,
          country: raw.destinationCountry ?? undefined,
        }
      : undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
