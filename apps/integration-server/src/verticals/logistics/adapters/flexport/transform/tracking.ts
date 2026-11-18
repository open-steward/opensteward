import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface FlexportLegLocation {
  name?: string
  address?: {
    street_address?: string
    city?: string
    state?: string
    zip?: string
    country_code?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface FlexportShipmentLeg {
  id: string
  status: string
  carrier_name?: string
  origin?: FlexportLegLocation
  destination?: FlexportLegLocation
  actual_departure_date?: string
  actual_arrival_date?: string
  estimated_departure_date?: string
  estimated_arrival_date?: string
  [key: string]: unknown
}

export interface FlexportLegsResponse {
  data: FlexportShipmentLeg[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: FlexportLegLocation | undefined): Address | undefined {
  if (!loc?.address) return undefined
  const addr = loc.address
  const hasAny = addr.city || addr.state || addr.zip || addr.country_code
  if (!hasAny) return undefined
  return {
    street1: addr.street_address ?? undefined,
    city: addr.city ?? undefined,
    state: addr.state ?? undefined,
    postalCode: addr.zip ?? undefined,
    country: addr.country_code ?? undefined,
  }
}

export function transformTrackingEvents(shipmentId: string, raw: FlexportLegsResponse): TrackingEvent[] {
  const legs = raw.data ?? []

  const events: TrackingEvent[] = legs.map((leg) => ({
    shipmentId,
    carrierId: 'flexport',
    status: mapTrackingStatus(leg.status),
    description: leg.carrier_name ? `${leg.carrier_name} - ${leg.status}` : leg.status,
    location: toLocation(leg.destination),
    occurredAt: toISODate(leg.actual_arrival_date ?? leg.actual_departure_date ?? leg.estimated_departure_date),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      shipmentId,
      carrierId: 'flexport',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
