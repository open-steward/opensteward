import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface DescartesTrackingLocation {
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  facilityName?: string | null
  [key: string]: unknown
}

export interface DescartesTrackingEvent {
  eventCode?: string | null
  eventDescription?: string | null
  eventTimestamp?: string | null
  location?: DescartesTrackingLocation | null
  [key: string]: unknown
}

export interface DescartesTrackingResponse {
  trackingNumber?: string | null
  shipmentId?: string | null
  currentStatus?: string | null
  currentStatusDescription?: string | null
  events?: DescartesTrackingEvent[]
  [key: string]: unknown
}

function mapStatus(code: string | null | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  const upper = code.toUpperCase().replace(/[-\s]/g, '_')
  return (TRACKING_STATUS_MAP[upper] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: DescartesTrackingLocation | null | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.postalCode || loc.country || loc.facilityName
  if (!hasAny) return undefined
  return {
    name: loc.facilityName ?? undefined,
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.postalCode ?? undefined,
    country: loc.country ?? undefined,
  }
}

export function transformTrackingEvents(raw: DescartesTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.trackingNumber ?? raw.shipmentId ?? undefined

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'descartes',
    status: mapStatus(evt.eventCode),
    description: evt.eventDescription ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.eventTimestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'descartes',
      status: mapStatus(raw.currentStatus),
      description: raw.currentStatusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
