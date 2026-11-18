import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface TforceTrackingEvent {
  statusCode: string
  statusDescription: string
  eventDateTime: string | null
  city: string | null
  stateProvince: string | null
  [key: string]: unknown
}

export interface TforceTrackingResponse {
  proNumber: string
  currentStatusCode: string | null
  events: TforceTrackingEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string): TrackingEventStatus {
  switch ((code ?? '').toUpperCase()) {
    case 'PU':
    case 'PICKUP':
      return 'PRE_TRANSIT'
    case 'IT':
    case 'IN_TRANSIT':
      return 'IN_TRANSIT'
    case 'OFD':
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DL':
    case 'DELIVERED':
      return 'DELIVERED'
    case 'EX':
    case 'EXCEPTION':
      return 'FAILURE'
    case 'OH':
    case 'ON_HOLD':
      return 'UNKNOWN'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(raw: TforceTrackingResponse): TrackingEvent[] {
  if (!raw || !raw.events || raw.events.length === 0) {
    return [{
      trackingNumber: raw?.proNumber ?? '',
      carrierId: 'tforce-freight',
      status: 'UNKNOWN',
      metadata: (raw ?? {}) as Record<string, unknown>,
    }]
  }

  return raw.events.map((evt) => ({
    trackingNumber: raw.proNumber,
    carrierId: 'tforce-freight',
    status: mapTrackingStatus(evt.statusCode),
    description: evt.statusDescription || undefined,
    location: (evt.city || evt.stateProvince)
      ? { city: evt.city ?? undefined, state: evt.stateProvince ?? undefined }
      : undefined,
    occurredAt: toISODate(evt.eventDateTime),
    metadata: evt as Record<string, unknown>,
  }))
}
