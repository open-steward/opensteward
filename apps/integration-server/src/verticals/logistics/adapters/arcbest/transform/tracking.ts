import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface ArcbestTrackingEvent {
  eventCode: string
  eventDescription: string
  eventDateTime: string | null
  city: string | null
  state: string | null
  [key: string]: unknown
}

export interface ArcbestTrackingResponse {
  proNumber: string
  currentStatus: string | null
  events: ArcbestTrackingEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string): TrackingEventStatus {
  switch ((code ?? '').toUpperCase()) {
    case 'PICKUP':
    case 'PICKED_UP':
      return 'PRE_TRANSIT'
    case 'IN_TRANSIT':
    case 'INTRANSIT':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'EXCEPTION':
      return 'FAILURE'
    case 'ON_HOLD':
      return 'UNKNOWN'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(raw: ArcbestTrackingResponse): TrackingEvent[] {
  if (!raw || !raw.events || raw.events.length === 0) {
    return [{
      trackingNumber: raw?.proNumber ?? '',
      carrierId: 'arcbest',
      status: 'UNKNOWN',
      metadata: (raw ?? {}) as Record<string, unknown>,
    }]
  }

  return raw.events.map((evt) => ({
    trackingNumber: raw.proNumber,
    carrierId: 'arcbest',
    status: mapTrackingStatus(evt.eventCode),
    description: evt.eventDescription || undefined,
    location: (evt.city || evt.state)
      ? { city: evt.city ?? undefined, state: evt.state ?? undefined }
      : undefined,
    occurredAt: toISODate(evt.eventDateTime),
    metadata: evt as Record<string, unknown>,
  }))
}
