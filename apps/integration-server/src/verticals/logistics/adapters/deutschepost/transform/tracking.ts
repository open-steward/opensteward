import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface DeutschePostTrackingLocation {
  city?: string
  state?: string
  postalCode?: string
  countryCode?: string
  [key: string]: unknown
}

export interface DeutschePostTrackingEvent {
  timestamp: string
  status: string
  description: string
  location?: DeutschePostTrackingLocation
  [key: string]: unknown
}

export interface DeutschePostTrackingResponse {
  shipmentId: string
  trackingNumber?: string
  events?: DeutschePostTrackingEvent[]
  currentStatus?: {
    status?: string
    description?: string
  }
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: DeutschePostTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.postalCode || loc.countryCode
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.postalCode ?? undefined,
    country: loc.countryCode ?? undefined,
  }
}

export function transformTrackingEvents(raw: DeutschePostTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.trackingNumber ?? raw.shipmentId

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'deutschepost',
    status: mapTrackingStatus(evt.status),
    description: evt.description ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.timestamp),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'deutschepost',
      status: mapTrackingStatus(raw.currentStatus?.status),
      description: raw.currentStatus?.description ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
