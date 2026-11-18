import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Estes raw types ────────────────────────────────────────────────────────

export interface EstesStatusEvent {
  statusCode: string
  statusDescription: string
  date: string
  time: string
  location: string | null
  city: string | null
  state: string | null
  [key: string]: unknown
}

export interface EstesTracking {
  pro: string
  status: string
  statusDescription: string
  events: EstesStatusEvent[]
  deliveryDate: string | null
  deliveryTime: string | null
  appointmentDate: string | null
  receivedBy: string | null
  [key: string]: unknown
}

export interface EstesTrackingResponse {
  data: EstesTracking[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(statusCode: string): TrackingEventStatus {
  switch (statusCode) {
    case 'P':                       return 'PRE_TRANSIT'        // Picked up
    case 'I':                       return 'IN_TRANSIT'         // In transit
    case 'O':                       return 'OUT_FOR_DELIVERY'
    case 'D':                       return 'DELIVERED'
    case 'X':                       return 'FAILURE'            // Exception
    case 'A':                       return 'IN_TRANSIT'         // Appointment set
    default:                        return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(
  raw: EstesTrackingResponse,
  proNumber: string,
): TrackingEvent[] {
  const shipment = raw.data?.[0]
  if (!shipment) {
    return [{
      trackingNumber: proNumber,
      carrierId: 'estes',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    }]
  }

  const events: TrackingEvent[] = (shipment.events ?? []).map((evt) => ({
    trackingNumber: shipment.pro ?? proNumber,
    carrierId: 'estes',
    status: mapTrackingStatus(evt.statusCode),
    description: evt.statusDescription || undefined,
    location: evt.city || evt.location
      ? {
          city: evt.city ?? evt.location ?? undefined,
          state: evt.state ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(`${evt.date}T${evt.time}`),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: proNumber,
      carrierId: 'estes',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
