import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface OneLineTrackingEvent {
  eventCode?: string | null
  eventName?: string | null
  description?: string | null
  eventDateTime?: string | null
  location?: { name?: string | null; city?: string | null; country?: string | null; unLocode?: string | null } | null
  [key: string]: unknown
}

export interface OneLineTrackingResponse {
  containerNumber?: string | null
  bookingNumber?: string | null
  events?: OneLineTrackingEvent[]
  [key: string]: unknown
}

export function mapStatus(eventName: string | null | undefined): TrackingEventStatus {
  if (!eventName) return 'UNKNOWN'
  const t = eventName.toUpperCase()
  if (t.includes('GATE-OUT') || t.includes('GATE OUT') || t.includes('EMPTY')) return 'PRE_TRANSIT'
  if (t.includes('LOAD') || t.includes('DEPART')) return 'IN_TRANSIT'
  if (t.includes('ARRIV') || t.includes('DISCHARG')) return 'IN_TRANSIT'
  if (t.includes('GATE-IN') || t.includes('GATE IN')) return 'OUT_FOR_DELIVERY'
  if (t.includes('DELIVERED')) return 'DELIVERED'
  if (t.includes('FAIL') || t.includes('EXCEPTION')) return 'FAILURE'
  return 'UNKNOWN'
}

export function transformTracking(raw: OneLineTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []
  if (events.length === 0) {
    return [
      {
        trackingNumber: raw.containerNumber ?? undefined,
        carrierId: 'one-line',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }
  return events.map((evt) => ({
    trackingNumber: raw.containerNumber ?? undefined,
    carrierId: 'one-line',
    status: mapStatus(evt.eventName ?? evt.eventCode),
    description: evt.description || evt.eventName || undefined,
    location: evt.location
      ? {
          city: evt.location.city ?? evt.location.name ?? undefined,
          country: evt.location.country ?? undefined,
          postalCode: evt.location.unLocode ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(evt.eventDateTime),
    metadata: evt as Record<string, unknown>,
  }))
}
