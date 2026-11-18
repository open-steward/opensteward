import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

// ── Raw API types ────────────────────────────────────────────────────────────

export interface CHRTrackingLocation {
  city?: string
  stateProvince?: string
  postalCode?: string
  country?: string
  latitude?: number
  longitude?: number
  [key: string]: unknown
}

export interface CHRTrackingEvent {
  eventCode?: string
  statusCode?: string
  description?: string
  occurredAt?: string
  eventDateTime?: string
  location?: CHRTrackingLocation
  [key: string]: unknown
}

export interface CHRTrackingResponse {
  loadId?: string
  shipmentId?: string
  proNumber?: string
  trackingNumber?: string
  currentStatus?: string
  statusDescription?: string
  estimatedDelivery?: string
  events?: CHRTrackingEvent[]
  stops?: CHRTrackingEvent[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: CHRTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.stateProvince || loc.postalCode || loc.country
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.stateProvince ?? undefined,
    postalCode: loc.postalCode ?? undefined,
    country: (loc.country as Address['country']) ?? undefined,
  }
}

// ── Public transform ─────────────────────────────────────────────────────────

export function transformTrackingEvents(raw: CHRTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.proNumber ?? raw.trackingNumber ?? raw.loadId ?? raw.shipmentId

  const sourceEvents: CHRTrackingEvent[] = [
    ...(raw.events ?? []),
    ...(raw.stops ?? []),
  ]

  const events: TrackingEvent[] = sourceEvents.map((evt) => ({
    trackingNumber,
    carrierId: 'ch-robinson',
    status: mapTrackingStatus(evt.statusCode ?? evt.eventCode),
    description: evt.description ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.occurredAt ?? evt.eventDateTime),
    metadata: raw as Record<string, unknown>,
  }))

  // If no events returned, synthesise one from the top-level status
  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'ch-robinson',
      status: mapTrackingStatus(raw.currentStatus),
      description: raw.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
