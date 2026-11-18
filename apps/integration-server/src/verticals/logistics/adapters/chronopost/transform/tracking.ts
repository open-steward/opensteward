import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Chronopost raw types ──────────────────────────────────────────────────

export interface ChronopostEvent {
  code: string
  label: string | null
  date: string
  lieu: string | null
  [key: string]: unknown
}

export interface ChronopostTracking {
  skybillNumber: string
  eventInfoComp: string | null
  events: ChronopostEvent[]
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapTrackingStatus(code: string): TrackingEventStatus {
  switch (code) {
    case 'PRISE_EN_CHARGE':    return 'PRE_TRANSIT'
    case 'EN_COURS':           return 'IN_TRANSIT'
    case 'EN_LIVRAISON':       return 'OUT_FOR_DELIVERY'
    case 'LIVRE':              return 'DELIVERED'
    case 'ECHEC_LIVRAISON':    return 'FAILURE'
    case 'RETOUR':             return 'RETURN_TO_SENDER'
    case 'ANOMALIE':           return 'FAILURE'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformTracking(
  raw: ChronopostTracking,
  trackingNumber: string,
): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'chronopost',
    status: mapTrackingStatus(evt.code),
    description: evt.label || undefined,
    location: evt.lieu
      ? { city: evt.lieu }
      : undefined,
    occurredAt: toISODate(evt.date),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'chronopost',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
