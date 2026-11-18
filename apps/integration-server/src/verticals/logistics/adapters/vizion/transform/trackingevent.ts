/**
 * Vizion individual tracking-event transform.
 *
 * Provides a per-event transform for canonical TrackingEvent records so that
 * the router can serve listTrackingEvents with individual event entries derived
 * from Vizion's container event stream.
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface VizionTrackingEvent {
  event_type?: string | null
  description?: string | null
  timestamp?: string | null
  location?: {
    name?: string | null
    city?: string | null
    country?: string | null
    un_locode?: string | null
  } | null
  [key: string]: unknown
}

function mapStatus(eventType: string | null | undefined): TrackingEventStatus {
  if (!eventType) return 'UNKNOWN'
  const t = eventType.toUpperCase()
  if (t.includes('GATE-OUT') || t.includes('GATE OUT') || t.includes('EMPTY'))
    return 'PRE_TRANSIT'
  if (t.includes('LOAD') || t.includes('DEPART')) return 'IN_TRANSIT'
  if (t.includes('ARRIV') || t.includes('DISCHARG')) return 'IN_TRANSIT'
  if (t.includes('GATE-IN') || t.includes('GATE IN')) return 'OUT_FOR_DELIVERY'
  if (t.includes('DELIVERED')) return 'DELIVERED'
  if (t.includes('FAIL') || t.includes('EXCEPTION')) return 'FAILURE'
  return 'UNKNOWN'
}

export function transformTrackingEvent(
  raw: VizionTrackingEvent,
  trackingNumber?: string,
): TrackingEvent {
  return {
    trackingNumber: trackingNumber || undefined,
    carrierId: 'vizion',
    status: mapStatus(raw.event_type),
    description: raw.description || raw.event_type || undefined,
    location: raw.location
      ? {
          city: raw.location.city ?? raw.location.name ?? undefined,
          country: raw.location.country ?? undefined,
          postalCode: raw.location.un_locode ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(raw.timestamp),
    metadata: raw as Record<string, unknown>,
  }
}
