import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toDimensions, toISODate } from '../../shared/transform'

// ─── Forward Air raw types ────────────────────────────────────────────────

export interface ForwardAirPackage {
  trackingNumber: string | null
  weight: number | null
  length: number | null
  width: number | null
  height: number | null
  [key: string]: unknown
}

export interface ForwardAirAddress {
  name: string | null
  company: string | null
  street1: string | null
  street2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  phone: string | null
  email: string | null
  [key: string]: unknown
}

export interface ForwardAirShipmentResponse {
  shipmentId: string | null
  trackingNumber: string | null
  status: string | null
  serviceCode: string | null
  origin: ForwardAirAddress | null
  destination: ForwardAirAddress | null
  packages: ForwardAirPackage[] | null
  totalWeight: number | null
  reference: string | null
  createdAt: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'CREATED':          return 'PENDING'
    case 'RECEIVED':         return 'IN_TRANSIT'
    case 'IN_TRANSIT':       return 'IN_TRANSIT'
    case 'AT_TERMINAL':      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY': return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':        return 'DELIVERED'
    case 'EXCEPTION':        return 'EXCEPTION'
    case 'RETURNED':         return 'RETURNED'
    case 'CANCELLED':        return 'CANCELLED'
    default:                 return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: ForwardAirShipmentResponse): Shipment {
  const firstPkg = (raw.packages ?? [])[0]

  return {
    id: raw.shipmentId ?? raw.trackingNumber ?? '',
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'forward-air',
    serviceCode: raw.serviceCode ?? undefined,
    originAddress: toAddress(raw.origin as Record<string, unknown> | null),
    destinationAddress: toAddress(raw.destination as Record<string, unknown> | null),
    totalWeight: toWeight(raw.totalWeight, 'lb'),
    dimensions: firstPkg
      ? toDimensions(firstPkg.length, firstPkg.width, firstPkg.height, 'in')
      : undefined,
    packages: (raw.packages ?? []).map((p) => ({
      trackingNumber: p.trackingNumber ?? undefined,
      weight: toWeight(p.weight, 'lb'),
      dimensions: toDimensions(p.length, p.width, p.height, 'in'),
    })),
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
