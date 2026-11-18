import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { LOAD_STATUS_TRACKING_MAP } from '../constants'

// ── Raw Truckstop tender/tracking shapes ──────────────────────────────────

export interface TruckstopTenderLocation {
  city?: string
  state?: string
  zip?: string
  country?: string
  [key: string]: unknown
}

export interface TruckstopTenderEvent {
  eventType?: string
  eventDescription?: string
  eventDateTime?: string
  location?: TruckstopTenderLocation
  [key: string]: unknown
}

export interface TruckstopTenderResponse {
  tenderId?: string
  loadId?: string
  loadGuid?: string
  loadNumber?: string
  status?: string
  statusDescription?: string
  events?: TruckstopTenderEvent[]
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (LOAD_STATUS_TRACKING_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: TruckstopTenderLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.zip || loc.country
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.zip ?? undefined,
    country: (loc.country as string | undefined) ?? undefined,
  }
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformTrackingEvents(raw: TruckstopTenderResponse): TrackingEvent[] {
  const trackingNumber = raw.loadNumber ?? raw.loadGuid ?? raw.loadId ?? ''
  const carrierId = 'truckstop'

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId,
    status: mapStatus(evt.eventType ?? raw.status),
    description: evt.eventDescription ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.eventDateTime) ?? undefined,
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId,
      status: mapStatus(raw.status),
      description: raw.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
