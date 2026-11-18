import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface NZPostTrackingLocation {
  name?: string
  city?: string
  region?: string
  postCode?: string
  countryCode?: string
  [key: string]: unknown
}

export interface NZPostTrackingEvent {
  eventDateTime: string
  eventType: string
  eventDescription: string
  location?: NZPostTrackingLocation
  [key: string]: unknown
}

export interface NZPostTrackingResponse {
  trackingNumber: string
  status?: string
  statusDescription?: string
  events?: NZPostTrackingEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: NZPostTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.region || loc.postCode || loc.countryCode
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.region ?? undefined,
    postalCode: loc.postCode ?? undefined,
    country: loc.countryCode ?? undefined,
  }
}

export function transformTrackingEvents(raw: NZPostTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.trackingNumber

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'nzpost',
    status: mapTrackingStatus(evt.eventType),
    description: evt.eventDescription ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.eventDateTime),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'nzpost',
      status: mapTrackingStatus(raw.status),
      description: raw.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
