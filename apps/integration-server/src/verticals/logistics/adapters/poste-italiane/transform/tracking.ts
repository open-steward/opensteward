import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Poste Italiane raw types ──────────────────────────────────────────────

export interface PosteItalianeTrackingEvent {
  stato: string
  descrizione: string | null
  data: string
  filiale: string | null
  localita: string | null
  [key: string]: unknown
}

export interface PosteItalianeTrackingResponse {
  tracking_code: string
  status: string | null
  eventi: PosteItalianeTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(stato: string): TrackingEventStatus {
  switch (stato) {
    case 'ACCETTATO':            return 'PRE_TRANSIT'
    case 'IN_TRANSITO':          return 'IN_TRANSIT'
    case 'IN_CONSEGNA':          return 'OUT_FOR_DELIVERY'
    case 'CONSEGNATO':           return 'DELIVERED'
    case 'TENTATIVO_FALLITO':    return 'FAILURE'
    case 'RESO':                 return 'RETURN_TO_SENDER'
    case 'IN_GIACENZA':          return 'AVAILABLE_FOR_PICKUP'
    default:                     return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: PosteItalianeTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.eventi ?? []).map((evt) => ({
    trackingNumber: raw.tracking_code ?? undefined,
    carrierId: 'poste-italiane',
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
      trackingNumber: raw.tracking_code ?? undefined,
      carrierId: 'poste-italiane',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
