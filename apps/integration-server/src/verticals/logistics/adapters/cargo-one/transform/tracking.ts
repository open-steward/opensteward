import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface CargoOneTrackingLocation {
  city?: string | null
  state?: string | null
  country_code?: string | null
  postal_code?: string | null
}

export interface CargoOneTrackingEvent {
  id?: string | null
  status?: string | null
  description?: string | null
  location?: CargoOneTrackingLocation | null
  occurred_at?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export interface CargoOneTrackingResponse {
  id?: string | null
  shipment_id?: string | null
  tracking_number?: string | null
  carrier_id?: string | null
  status?: string | null
  events?: CargoOneTrackingEvent[] | null
  created_at?: string | null
  [key: string]: unknown
}

function mapTrackingStatus(raw: string | null | undefined): TrackingEventStatus {
  if (!raw) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[raw.toLowerCase()] as TrackingEventStatus | undefined) ?? 'UNKNOWN'
}

function toLocation(loc: CargoOneTrackingLocation | null | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.country_code || loc.postal_code
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    country: loc.country_code ?? undefined,
    postalCode: loc.postal_code ?? undefined,
  }
}

export function transformTrackingEvents(raw: CargoOneTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []

  if (events.length === 0) {
    return [
      {
        id: raw.id ?? undefined,
        shipmentId: raw.shipment_id ?? undefined,
        trackingNumber: raw.tracking_number ?? undefined,
        carrierId: raw.carrier_id ?? undefined,
        status: mapTrackingStatus(raw.status),
        createdAt: toISODate(raw.created_at),
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    id: evt.id ?? undefined,
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier_id ?? undefined,
    status: mapTrackingStatus(evt.status),
    description: evt.description ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.occurred_at),
    createdAt: toISODate(evt.created_at ?? raw.created_at),
    metadata: evt as Record<string, unknown>,
  }))
}
