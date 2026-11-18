import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { VISIBILITY_STATUS_MAP } from '../constants'

// ── Raw Visibility API shapes ─────────────────────────────────────────────────

export interface TransporeonVisibilityLocation {
  city?: string
  country?: string
  postal_code?: string
  latitude?: number
  longitude?: number
  [key: string]: unknown
}

export interface TransporeonVisibilityEvent {
  transport_id?: string | number
  transport_identifier?: string
  event_type?: string
  event_code?: string
  status?: string
  timestamp?: string
  event_time?: string
  location?: TransporeonVisibilityLocation
  description?: string
  eta?: string
  [key: string]: unknown
}

export interface TransporeonVisibilityResponse {
  events?: TransporeonVisibilityEvent[]
  data?: TransporeonVisibilityEvent[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapVisibilityStatus(
  eventType: string | undefined,
  status: string | undefined,
): TrackingEventStatus {
  const code = eventType ?? status ?? ''
  return (VISIBILITY_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toEventLocation(
  loc: TransporeonVisibilityLocation | undefined,
): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.country || loc.postal_code
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    postalCode: loc.postal_code ?? undefined,
    country: loc.country ?? undefined,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Transform Transporeon Visibility API events into canonical TrackingEvents.
 */
export function transformVisibilityEvents(
  trackingNumber: string,
  raw: TransporeonVisibilityResponse,
): TrackingEvent[] {
  const events = raw.events ?? raw.data ?? []

  if (events.length === 0) {
    return [
      {
        trackingNumber,
        carrierId: 'transporeon',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    trackingNumber,
    carrierId: 'transporeon',
    status: mapVisibilityStatus(evt.event_type ?? evt.event_code, evt.status),
    description: evt.description ?? evt.event_type ?? undefined,
    location: toEventLocation(evt.location),
    occurredAt: toISODate(evt.timestamp ?? evt.event_time),
    metadata: evt as Record<string, unknown>,
  }))
}

/**
 * Build a single synthetic TrackingEvent from a transport DTO's qualifier/status.
 * Used when the Visibility API is unavailable or for a quick status snapshot.
 */
export function trackingEventFromTransport(
  trackingNumber: string,
  qualifier: string | undefined,
  timestamp: string | undefined,
  description: string | undefined,
  raw: Record<string, unknown>,
): TrackingEvent {
  const statusMap: Record<string, TrackingEventStatus> = {
    'tour.routed': 'PRE_TRANSIT',
    'tour.accepted': 'IN_TRANSIT',
    'tour.assign': 'IN_TRANSIT',
    'tour.assigned.change': 'IN_TRANSIT',
    'tour.assigned.cancelled': 'FAILURE',
    'tour.tiflow.cancelled': 'FAILURE',
    'tour.tiflow.modified': 'IN_TRANSIT',
  }

  return {
    trackingNumber,
    carrierId: 'transporeon',
    status: (qualifier ? (statusMap[qualifier] ?? 'UNKNOWN') : 'UNKNOWN') as TrackingEventStatus,
    description: description ?? qualifier ?? undefined,
    occurredAt: toISODate(timestamp),
    metadata: raw,
  }
}
