import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface DhlAfricaTrackingLocation {
  address?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  [key: string]: unknown
}

export interface DhlAfricaTrackingEvent {
  timestamp: string
  status: string
  description: string
  location?: DhlAfricaTrackingLocation
  [key: string]: unknown
}

export interface DhlAfricaTrackingResponse {
  trackingNumber: string
  status?: string
  statusDescription?: string
  events?: DhlAfricaTrackingEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: DhlAfricaTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.postalCode || loc.country
  if (!hasAny) return undefined
  return {
    street1: loc.address ?? undefined,
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.postalCode ?? undefined,
    country: loc.country ?? undefined,
  }
}

export function transformTrackingEvents(raw: DhlAfricaTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.trackingNumber

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'dhl-africa',
    status: mapTrackingStatus(evt.status),
    description: evt.description ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.timestamp),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'dhl-africa',
      status: mapTrackingStatus(raw.status),
      description: raw.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
