import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface TrimbleTruckmateLocationRaw {
  address?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  latitude?: number
  longitude?: number
  [key: string]: unknown
}

export interface TrimbleTruckmateTrackingEventRaw {
  eventId?: string
  timestamp?: string
  eventDate?: string
  status?: string
  statusCode?: string
  description?: string
  eventDescription?: string
  location?: TrimbleTruckmateLocationRaw
  [key: string]: unknown
}

export interface TrimbleTruckmateTrackingResponse {
  shipmentId?: string
  tripId?: string
  trackingNumber?: string
  status?: string
  statusDescription?: string
  events?: TrimbleTruckmateTrackingEventRaw[]
  trackingEvents?: TrimbleTruckmateTrackingEventRaw[]
  [key: string]: unknown
}

function mapStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  const upper = code.toUpperCase().replace(/[\s-]/g, '_')
  return (TRACKING_STATUS_MAP[upper] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: TrimbleTruckmateLocationRaw | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.address || loc.city || loc.state || loc.zipCode || loc.country
  if (!hasAny) return undefined
  return {
    street1: loc.address ?? undefined,
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.zipCode ?? undefined,
    country: loc.country ?? undefined,
  }
}

export function transformTrackingEvents(raw: TrimbleTruckmateTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.trackingNumber ?? raw.shipmentId ?? raw.tripId ?? ''
  const rawEvents = raw.events ?? raw.trackingEvents ?? []

  const events: TrackingEvent[] = rawEvents.map((evt) => ({
    trackingNumber,
    carrierId: 'trimble-truckmate',
    status: mapStatus(evt.statusCode ?? evt.status),
    description: evt.eventDescription ?? evt.description ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.timestamp ?? evt.eventDate),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'trimble-truckmate',
      status: mapStatus(raw.status),
      description: raw.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
