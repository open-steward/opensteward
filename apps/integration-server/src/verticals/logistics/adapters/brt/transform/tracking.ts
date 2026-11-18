import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── BRT raw types ─────────────────────────────────────────────────────────

export interface BrtTrackingEvent {
  stato: string
  descrizione: string | null
  data: string
  filiale: string | null
  localita: string | null
  [key: string]: unknown
}

export interface BrtTrackingResponse {
  shipment_id: string
  status: string | null
  eventi: BrtTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(stato: string): TrackingEventStatus {
  switch (stato) {
    case 'RITIRATO':              return 'PRE_TRANSIT'
    case 'IN_TRANSITO':           return 'IN_TRANSIT'
    case 'IN_CONSEGNA':           return 'OUT_FOR_DELIVERY'
    case 'CONSEGNATO':            return 'DELIVERED'
    case 'MANCATA_CONSEGNA':      return 'FAILURE'
    case 'RESO':                  return 'RETURN_TO_SENDER'
    case 'IN_GIACENZA':           return 'AVAILABLE_FOR_PICKUP'
    default:                      return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: BrtTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.eventi ?? []).map((evt) => ({
    trackingNumber: raw.shipment_id ?? undefined,
    carrierId: 'brt',
    status: mapTrackingStatus(evt.stato),
    description: evt.descrizione || undefined,
    location: evt.localita
      ? { city: evt.localita }
      : undefined,
    occurredAt: toISODate(evt.data),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.shipment_id ?? undefined,
      carrierId: 'brt',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
