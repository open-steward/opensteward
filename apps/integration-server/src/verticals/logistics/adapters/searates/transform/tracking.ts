import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface SearatesTrackingEvent {
  status?: string | null
  description?: string | null
  date?: string | null
  location?: { name?: string | null; city?: string | null; country?: string | null; locode?: string | null } | null
  [key: string]: unknown
}

export interface SearatesTrackingResponse {
  container?: string | null
  bookingNumber?: string | null
  events?: SearatesTrackingEvent[]
  [key: string]: unknown
}

export function mapStatus(eventStatus: string | null | undefined): TrackingEventStatus {
  if (!eventStatus) return 'UNKNOWN'
  const t = eventStatus.toUpperCase()
  if (t.includes('GATE-OUT') || t.includes('GATE OUT') || t.includes('EMPTY')) return 'PRE_TRANSIT'
  if (t.includes('LOAD') || t.includes('DEPART')) return 'IN_TRANSIT'
  if (t.includes('ARRIV') || t.includes('DISCHARG')) return 'IN_TRANSIT'
  if (t.includes('GATE-IN') || t.includes('GATE IN')) return 'OUT_FOR_DELIVERY'
  if (t.includes('DELIVERED')) return 'DELIVERED'
  if (t.includes('FAIL') || t.includes('EXCEPTION')) return 'FAILURE'
  return 'UNKNOWN'
}

export function transformTracking(raw: SearatesTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []
  if (events.length === 0) {
    return [
      {
        trackingNumber: raw.container ?? undefined,
        carrierId: 'searates',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }
  return events.map((evt) => ({
    trackingNumber: raw.container ?? undefined,
    carrierId: 'searates',
    status: mapStatus(evt.status),
    description: evt.description || evt.status || undefined,
    location: evt.location
      ? {
          city: evt.location.city ?? evt.location.name ?? undefined,
          country: evt.location.country ?? undefined,
          postalCode: evt.location.locode ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(evt.date),
    metadata: evt as Record<string, unknown>,
  }))
}
