import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Nationex raw types ─────────────────────────────────────────────────────

export interface NationexTrackingEvent {
  statusCode: string | null
  statusDescription: string | null
  eventDate: string | null
  city: string | null
  stateProvince: string | null
  country: string | null
  postalCode: string | null
  [key: string]: unknown
}

export interface NationexTrackingResponse {
  parcelId: string
  trackingNumber?: string | null
  status?: string | null
  events?: NationexTrackingEvent[] | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(code: string | null): TrackingEventStatus {
  switch (code) {
    case 'CREATED':
    case 'PICKUP_SCHEDULED':
    case 'PICKED_UP':           return 'PRE_TRANSIT'
    case 'IN_TRANSIT':
    case 'AT_FACILITY':
    case 'DEPARTED_FACILITY':   return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':    return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':           return 'DELIVERED'
    case 'HELD_FOR_PICKUP':
    case 'AVAILABLE_FOR_PICKUP': return 'AVAILABLE_FOR_PICKUP'
    case 'RETURNED':
    case 'RETURN_TO_SENDER':    return 'RETURN_TO_SENDER'
    case 'EXCEPTION':
    case 'UNDELIVERABLE':
    case 'DELIVERY_FAILED':     return 'FAILURE'
    default:                    return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: NationexTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []
  const trackingNumber = raw.trackingNumber ?? raw.parcelId

  if (events.length === 0) {
    return [
      {
        trackingNumber: trackingNumber ?? undefined,
        carrierId: 'nationex',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    trackingNumber: trackingNumber ?? undefined,
    carrierId: 'nationex',
    status: mapTrackingStatus(evt.statusCode),
    description: evt.statusDescription ?? undefined,
    location:
      evt.city || evt.stateProvince || evt.country || evt.postalCode
        ? {
            city: evt.city ?? undefined,
            state: evt.stateProvince ?? undefined,
            country: evt.country ?? undefined,
            postalCode: evt.postalCode ?? undefined,
          }
        : undefined,
    occurredAt: toISODate(evt.eventDate),
    metadata: evt as Record<string, unknown>,
  }))
}
