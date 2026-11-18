import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Colissimo raw types ───────────────────────────────────────────────────

export interface ColissimoTrackingEvent {
  code: string
  label: string | null
  date: string
  site: string | null
  [key: string]: unknown
}

export interface ColissimoTrackingResponse {
  idShip: string
  holder: number | null
  events: ColissimoTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(code: string): TrackingEventStatus {
  switch (code) {
    case 'PRIS_EN_CHARGE':          return 'PRE_TRANSIT'
    case 'EN_COURS_ACHEMINEMENT':   return 'IN_TRANSIT'
    case 'EN_LIVRAISON':            return 'OUT_FOR_DELIVERY'
    case 'LIVRE':                   return 'DELIVERED'
    case 'AVIS_DE_PASSAGE':         return 'FAILURE'
    case 'RETOUR':                  return 'RETURN_TO_SENDER'
    default:                        return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: ColissimoTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.idShip ?? undefined,
    carrierId: 'colissimo',
    status: mapTrackingStatus(evt.code),
    description: evt.label || undefined,
    location: evt.site
      ? { city: evt.site }
      : undefined,
    occurredAt: toISODate(evt.date),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.idShip ?? undefined,
      carrierId: 'colissimo',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
