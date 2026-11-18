import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface RoyalMailTrackingLocation {
  addressLine1?: string
  city?: string
  county?: string
  postCode?: string
  countryCode?: string
  [key: string]: unknown
}

export interface RoyalMailTrackingEvent {
  eventDateTime: string
  eventType: string
  eventDescription: string
  location?: RoyalMailTrackingLocation
  [key: string]: unknown
}

export interface RoyalMailTrackingResponse {
  trackingNumber: string
  events?: RoyalMailTrackingEvent[]
  summary?: {
    statusCategory?: string
    statusDescription?: string
  }
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: RoyalMailTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.county || loc.postCode || loc.countryCode
  if (!hasAny) return undefined
  return {
    street1: loc.addressLine1 ?? undefined,
    city: loc.city ?? undefined,
    state: loc.county ?? undefined,
    postalCode: loc.postCode ?? undefined,
    country: loc.countryCode ?? undefined,
  }
}

export function transformTrackingEvents(raw: RoyalMailTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.trackingNumber

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'royalmail',
    status: mapTrackingStatus(evt.eventType),
    description: evt.eventDescription ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.eventDateTime),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'royalmail',
      status: mapTrackingStatus(raw.summary?.statusCategory),
      description: raw.summary?.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
