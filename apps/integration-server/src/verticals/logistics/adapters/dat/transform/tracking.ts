import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface DatTrackingLocation {
  city?: string
  state?: string
  postalCode?: string
  country?: string
  [key: string]: unknown
}

export interface DatTrackingEvent {
  eventId?: string
  timestamp: string
  statusCode: string
  description?: string
  location?: DatTrackingLocation
  [key: string]: unknown
}

export interface DatLoadTrackingResponse {
  loadId: string
  status?: string
  statusDescription?: string
  trackingEvents?: DatTrackingEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: DatTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.postalCode || loc.country
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.postalCode ?? undefined,
    country: loc.country ?? undefined,
  }
}

export function transformTrackingEvents(raw: DatLoadTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.loadId

  const events: TrackingEvent[] = (raw.trackingEvents ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'dat',
    status: mapTrackingStatus(evt.statusCode),
    description: evt.description ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'dat',
      status: mapTrackingStatus(raw.status),
      description: raw.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
