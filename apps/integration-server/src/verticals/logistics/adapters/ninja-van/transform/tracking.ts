import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface NinjaVanTrackingLocation {
  address1?: string
  address2?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
  [key: string]: unknown
}

export interface NinjaVanTrackingEvent {
  timestamp: string
  status: string
  description: string
  location?: NinjaVanTrackingLocation
  [key: string]: unknown
}

export interface NinjaVanTrackingResponse {
  trackingId: string
  status?: string
  statusDescription?: string
  events?: NinjaVanTrackingEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: NinjaVanTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.postcode || loc.country
  if (!hasAny) return undefined
  return {
    street1: loc.address1 ?? undefined,
    street2: loc.address2 ?? undefined,
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.postcode ?? undefined,
    country: loc.country ?? undefined,
  }
}

export function transformTrackingEvents(raw: NinjaVanTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.trackingId

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'ninja-van',
    status: mapTrackingStatus(evt.status),
    description: evt.description ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.timestamp),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'ninja-van',
      status: mapTrackingStatus(raw.status),
      description: raw.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
