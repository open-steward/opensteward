import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { GoCometContainer } from './shipment'

export interface GoCometTrackingEvent {
  event_type?: string | null
  event_code?: string | null
  description?: string | null
  timestamp?: string | null
  event_time?: string | null
  location?: {
    name?: string | null
    city?: string | null
    country?: string | null
    un_locode?: string | null
    port_code?: string | null
  } | null
  [key: string]: unknown
}

export interface GoCometTrackingResponse {
  container_number?: string | null
  bill_of_lading?: string | null
  events?: GoCometTrackingEvent[]
  tracking_events?: GoCometTrackingEvent[]
  [key: string]: unknown
}

export function mapStatus(eventType: string | null | undefined): TrackingEventStatus {
  if (!eventType) return 'UNKNOWN'
  const t = eventType.toUpperCase()
  if (t.includes('EMPTY') || t.includes('GATE_OUT') || t.includes('GATE-OUT') || t.includes('LOAD_STARTED'))
    return 'PRE_TRANSIT'
  if (t.includes('LOADED') || t.includes('DEPARTED') || t.includes('SAILING') || t.includes('IN_TRANSIT'))
    return 'IN_TRANSIT'
  if (t.includes('ARRIV') || t.includes('DISCHARG') || t.includes('UNLOAD')) return 'IN_TRANSIT'
  if (t.includes('GATE_IN') || t.includes('GATE-IN') || t.includes('OUT_FOR_DELIVERY')) return 'OUT_FOR_DELIVERY'
  if (t.includes('DELIVERED') || t.includes('DELIVERY_DONE')) return 'DELIVERED'
  if (t.includes('FAIL') || t.includes('EXCEPTION') || t.includes('DELAY')) return 'FAILURE'
  if (t.includes('RETURN')) return 'RETURN_TO_SENDER'
  return 'UNKNOWN'
}

export function transformTracking(raw: GoCometTrackingResponse | GoCometContainer): TrackingEvent[] {
  const events =
    (raw as GoCometTrackingResponse).events ??
    (raw as GoCometTrackingResponse).tracking_events ??
    []

  const containerNumber =
    (raw as GoCometTrackingResponse).container_number ??
    undefined

  if (events.length === 0) {
    return [
      {
        trackingNumber: containerNumber,
        carrierId: 'gocomet',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => {
    const loc = evt.location
    return {
      trackingNumber: containerNumber,
      carrierId: 'gocomet',
      status: mapStatus(evt.event_type ?? evt.event_code),
      description: evt.description ?? evt.event_type ?? undefined,
      location: loc
        ? {
            city: loc.city ?? loc.name ?? undefined,
            country: loc.country ?? undefined,
            postalCode: loc.un_locode ?? loc.port_code ?? undefined,
          }
        : undefined,
      occurredAt: toISODate(evt.timestamp ?? evt.event_time),
      metadata: evt as Record<string, unknown>,
    }
  })
}
