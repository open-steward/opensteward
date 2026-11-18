import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface Kobo360TrackingLocation {
  address?: string
  city?: string
  state?: string
  country?: string
  latitude?: number
  longitude?: number
  [key: string]: unknown
}

export interface Kobo360TrackingEventRaw {
  id?: string
  timestamp?: string
  event_time?: string
  status?: string
  description?: string
  message?: string
  location?: Kobo360TrackingLocation
  [key: string]: unknown
}

export interface Kobo360TrackingResponse {
  trip_id?: string
  tracking_number?: string
  status?: string
  status_description?: string
  events?: Kobo360TrackingEventRaw[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code.toUpperCase()] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: Kobo360TrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.address || loc.city || loc.state || loc.country
  if (!hasAny) return undefined
  return {
    street1: loc.address ?? undefined,
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    country: loc.country ?? undefined,
  }
}

export function transformTrackingEvents(raw: Kobo360TrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.tracking_number ?? raw.trip_id ?? undefined

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'kobo360',
    status: mapTrackingStatus(evt.status),
    description: evt.description ?? evt.message ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.timestamp ?? evt.event_time),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'kobo360',
      status: mapTrackingStatus(raw.status),
      description: raw.status_description ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
