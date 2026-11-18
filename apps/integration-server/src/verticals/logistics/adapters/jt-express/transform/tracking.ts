import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── J&T Express raw types ─────────────────────────────────────────────────

export interface JtExpressTrackingEvent {
  status_code: string
  status_description: string | null
  timestamp: string
  location: string | null
  hub: string | null
  [key: string]: unknown
}

export interface JtExpressTrackingResponse {
  bill_code: string
  status: string | null
  events: JtExpressTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapTrackingStatus(statusCode: string): TrackingEventStatus {
  switch (statusCode) {
    case 'PICKUP':        return 'PRE_TRANSIT'
    case 'INBOUND':       return 'IN_TRANSIT'
    case 'OUTBOUND':      return 'IN_TRANSIT'
    case 'DELIVERING':    return 'OUT_FOR_DELIVERY'
    case 'SIGNED':        return 'DELIVERED'
    case 'PROBLEMATIC':   return 'FAILURE'
    case 'RETURNING':     return 'RETURN_TO_SENDER'
    default:              return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformTracking(raw: JtExpressTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.bill_code ?? undefined,
    carrierId: 'jt-express',
    status: mapTrackingStatus(evt.status_code),
    description: evt.status_description || undefined,
    location: evt.location
      ? { city: evt.location }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.bill_code ?? undefined,
      carrierId: 'jt-express',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
