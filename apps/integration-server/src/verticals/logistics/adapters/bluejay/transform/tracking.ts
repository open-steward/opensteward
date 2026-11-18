import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface BluejayTrackingLocation {
  address?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  [key: string]: unknown
}

export interface BluejayTrackingEvent {
  timestamp: string
  status: string
  description: string
  location?: BluejayTrackingLocation
  [key: string]: unknown
}

export interface BluejayTrackingResponse {
  shipmentId: string
  status?: string
  statusDescription?: string
  events?: BluejayTrackingEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: BluejayTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.zipCode || loc.country
  if (!hasAny) return undefined
  return {
    street1: loc.address ?? undefined,
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.zipCode ?? undefined,
    country: loc.country ?? undefined,
  }
}

export function transformTrackingEvents(raw: BluejayTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.shipmentId

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'bluejay',
    status: mapTrackingStatus(evt.status),
    description: evt.description ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.timestamp),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'bluejay',
      status: mapTrackingStatus(raw.status),
      description: raw.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
