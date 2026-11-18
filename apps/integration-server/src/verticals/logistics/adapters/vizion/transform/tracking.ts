import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface VizionTrackingEvent {
  event_type?: string | null
  description?: string | null
  timestamp?: string | null
  location?: { name?: string | null; city?: string | null; country?: string | null; un_locode?: string | null } | null
  [key: string]: unknown
}

export interface VizionTrackingResponse {
  container_number?: string | null
  bill_of_lading?: string | null
  references?: VizionTrackingEvent[]
  events?: VizionTrackingEvent[]
  [key: string]: unknown
}

export function mapStatus(eventType: string | null | undefined): TrackingEventStatus {
  if (!eventType) return 'UNKNOWN'
  const t = eventType.toUpperCase()
  if (t.includes('GATE-OUT') || t.includes('GATE OUT') || t.includes('EMPTY')) return 'PRE_TRANSIT'
  if (t.includes('LOAD') || t.includes('DEPART')) return 'IN_TRANSIT'
  if (t.includes('ARRIV') || t.includes('DISCHARG')) return 'IN_TRANSIT'
  if (t.includes('GATE-IN') || t.includes('GATE IN')) return 'OUT_FOR_DELIVERY'
  if (t.includes('DELIVERED')) return 'DELIVERED'
  if (t.includes('FAIL') || t.includes('EXCEPTION')) return 'FAILURE'
  return 'UNKNOWN'
}

export function transformTracking(raw: VizionTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []
  if (events.length === 0) {
    return [
      {
        trackingNumber: raw.container_number ?? undefined,
        carrierId: 'vizion',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }
  return events.map((evt) => ({
    trackingNumber: raw.container_number ?? undefined,
    carrierId: 'vizion',
    status: mapStatus(evt.event_type),
    description: evt.description || evt.event_type || undefined,
    location: evt.location
      ? {
          city: evt.location.city ?? evt.location.name ?? undefined,
          country: evt.location.country ?? undefined,
          postalCode: evt.location.un_locode ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))
}
