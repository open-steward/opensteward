import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { ROUTE_STATE_MAP } from '../constants'

// ─── Raw Samsara types ───────────────────────────────────────────────────────

export interface SamsaraAddress {
  id?: string
  name?: string
  formattedAddress?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  latitude?: number
  longitude?: number
  [key: string]: unknown
}

export interface SamsaraRouteStop {
  id?: string
  externalIds?: Record<string, string>
  name?: string
  state?: string
  scheduledArrivalTime?: string
  scheduledDepartureTime?: string
  actualArrivalTime?: string
  actualDepartureTime?: string
  estimatedArrivalTime?: string
  address?: SamsaraAddress
  singleUseLocation?: {
    latitude?: number
    longitude?: number
    address?: string
  }
  [key: string]: unknown
}

export interface SamsaraRoute {
  id?: string
  name?: string
  externalIds?: Record<string, string>
  notes?: string
  state?: string
  driverIds?: string[]
  vehicleIds?: string[]
  stops?: SamsaraRouteStop[]
  actualEndTime?: string
  actualStartTime?: string
  scheduledEndTime?: string
  scheduledStartTime?: string
  createdAtTime?: string
  updatedAtTime?: string
  [key: string]: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapRouteStatus(state: string | undefined): ShipmentStatus {
  if (!state) return 'UNKNOWN'
  switch (state) {
    case 'unstarted':
      return 'PENDING'
    case 'en_route':
      return 'IN_TRANSIT'
    case 'arrived':
      return 'IN_TRANSIT'
    case 'departed':
      return 'IN_TRANSIT'
    case 'skipped':
      return 'EXCEPTION'
    case 'completed':
      return 'DELIVERED'
    default:
      return (ROUTE_STATE_MAP[state] as ShipmentStatus) ?? 'UNKNOWN'
  }
}

function toCanonicalAddress(addr: SamsaraAddress | undefined): Address | undefined {
  if (!addr) return undefined
  const hasAny =
    addr.name ?? addr.addressLine1 ?? addr.city ?? addr.state ?? addr.postalCode ?? addr.country
  if (!hasAny) return undefined
  return {
    name: addr.name ?? undefined,
    street1: addr.addressLine1 ?? addr.formattedAddress ?? undefined,
    street2: addr.addressLine2 ?? undefined,
    city: addr.city ?? undefined,
    state: addr.state ?? undefined,
    postalCode: addr.postalCode ?? undefined,
    country: (addr.country as Address['country']) ?? undefined,
  }
}

function pickFirstStop(stops: SamsaraRouteStop[] | undefined): SamsaraRouteStop | undefined {
  return stops?.[0]
}

function pickLastStop(stops: SamsaraRouteStop[] | undefined): SamsaraRouteStop | undefined {
  if (!stops || stops.length === 0) return undefined
  return stops[stops.length - 1]
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformRoute(raw: SamsaraRoute): Shipment {
  const firstStop = pickFirstStop(raw.stops)
  const lastStop = pickLastStop(raw.stops)

  // Use the first external ID value as a tracking-number surrogate
  const externalIdValues = raw.externalIds ? Object.values(raw.externalIds) : []
  const trackingNumber = externalIdValues[0] ?? undefined

  return {
    id: raw.id ?? undefined,
    status: mapRouteStatus(raw.state),
    trackingNumber,
    carrierId: 'samsara',
    serviceCode: undefined,
    originAddress: toCanonicalAddress(firstStop?.address),
    destinationAddress: toCanonicalAddress(lastStop?.address),
    estimatedDeliveryAt: toISODate(lastStop?.estimatedArrivalTime ?? raw.scheduledEndTime),
    actualDeliveryAt: toISODate(lastStop?.actualArrivalTime ?? raw.actualEndTime),
    createdAt: toISODate(raw.createdAtTime) ?? undefined,
    updatedAt: toISODate(raw.updatedAtTime) ?? undefined,
    notes: raw.notes ?? undefined,
    mode: 'ftl',
    metadata: raw as Record<string, unknown>,
  }
}
