import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

// ── Raw GoFreight types ──────────────────────────────────────────────────────

export interface GoFreightTrackingLocation {
  city?: string
  state?: string
  country?: string
  [key: string]: unknown
}

export interface GoFreightTrackingEvent {
  timestamp?: string
  event_type?: string
  description?: string
  location?: GoFreightTrackingLocation
  [key: string]: unknown
}

export interface GoFreightTrackingResponse {
  ref?: string
  tracking_number?: string
  status?: string
  status_description?: string
  events?: GoFreightTrackingEvent[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code.toLowerCase()] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: GoFreightTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const addr: Address = {
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    country: loc.country ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTrackingEvents(raw: GoFreightTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.tracking_number ?? raw.ref ?? ''

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'gofreight',
    status: mapStatus(evt.event_type ?? evt.description),
    description: evt.description ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'gofreight',
      status: mapStatus(raw.status),
      description: raw.status_description ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
