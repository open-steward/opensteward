import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Mondial Relay raw types ───────────────────────────────────────────────

export interface MondialRelayTrackingEvent {
  code: string
  description: string | null
  date: string
  location: string | null
  country: string | null
  [key: string]: unknown
}

export interface MondialRelayTrackingResponse {
  tracking_number: string
  status: string | null
  events: MondialRelayTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(code: string): TrackingEventStatus {
  switch (code) {
    case 'PRIS_EN_CHARGE':             return 'PRE_TRANSIT'
    case 'EN_TRANSIT':                 return 'IN_TRANSIT'
    case 'DISPONIBLE_POINT_RELAIS':    return 'AVAILABLE_FOR_PICKUP'
    case 'LIVRE':                      return 'DELIVERED'
    case 'NON_LIVRE':                  return 'FAILURE'
    case 'RETOUR':                     return 'RETURN_TO_SENDER'
    default:                           return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: MondialRelayTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'mondialrelay',
    status: mapTrackingStatus(evt.code),
    description: evt.description || undefined,
    location: evt.location
      ? { city: evt.location, country: evt.country ?? undefined }
      : undefined,
    occurredAt: toISODate(evt.date),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: 'mondialrelay',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
