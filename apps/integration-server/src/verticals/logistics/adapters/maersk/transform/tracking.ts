import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Maersk raw types ───────────────────────────────────────────────────────

export interface MaerskTrackingEvent {
  eventType?: string | null
  eventClassifierCode?: string | null
  shipmentEventTypeCode?: string | null
  transportEventTypeCode?: string | null
  equipmentEventTypeCode?: string | null
  description?: string | null
  eventDateTime?: string | null
  eventLocation?: {
    locationName?: string | null
    UNLocationCode?: string | null
    city?: string | null
    country?: string | null
  } | null
  [key: string]: unknown
}

export interface MaerskTrackingResponse {
  containerNumber?: string | null
  bookingNumber?: string | null
  events?: MaerskTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

export function mapOceanEventToStatus(eventType: string | null | undefined): TrackingEventStatus {
  if (!eventType) return 'UNKNOWN'
  const t = eventType.toUpperCase()
  if (t.includes('GATE-OUT') || t.includes('GATE_OUT') || t.includes('EMPTY')) return 'PRE_TRANSIT'
  if (t.includes('LOAD') || t.includes('DEPART') || t.includes('IN TRANSIT') || t.includes('IN_TRANSIT')) return 'IN_TRANSIT'
  if (t.includes('VESSEL ARRIVAL') || t.includes('ARRI')) return 'IN_TRANSIT'
  if (t.includes('DISCHARG')) return 'IN_TRANSIT'
  if (t.includes('GATE-IN') || t.includes('GATE_IN')) return 'OUT_FOR_DELIVERY'
  if (t.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY'
  if (t.includes('DELIVERED')) return 'DELIVERED'
  if (t.includes('FAIL') || t.includes('EXCEPTION')) return 'FAILURE'
  return 'UNKNOWN'
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: MaerskTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []
  if (events.length === 0) {
    return [
      {
        trackingNumber: raw.containerNumber ?? undefined,
        carrierId: 'maersk',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => {
    const eventType =
      evt.eventType ??
      evt.shipmentEventTypeCode ??
      evt.transportEventTypeCode ??
      evt.equipmentEventTypeCode ??
      null
    return {
      trackingNumber: raw.containerNumber ?? undefined,
      carrierId: 'maersk',
      status: mapOceanEventToStatus(eventType),
      description: evt.description || eventType || undefined,
      location: evt.eventLocation
        ? {
            city: evt.eventLocation.city ?? evt.eventLocation.locationName ?? undefined,
            country: evt.eventLocation.country ?? undefined,
            postalCode: evt.eventLocation.UNLocationCode ?? undefined,
          }
        : undefined,
      occurredAt: toISODate(evt.eventDateTime),
      metadata: evt as Record<string, unknown>,
    }
  })
}
