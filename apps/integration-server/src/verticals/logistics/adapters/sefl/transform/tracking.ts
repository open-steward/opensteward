import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface SeflTrackingEvent {
  statusCode: string
  statusDescription: string
  eventDateTime: string | null
  city: string | null
  state: string | null
  [key: string]: unknown
}

export interface SeflTrackingResult {
  proNumber: string
  currentStatus: string | null
  history: SeflTrackingEvent[]
  [key: string]: unknown
}

export interface SeflTrackingResponse {
  result: SeflTrackingResult | null
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
    case 'HD':
    case 'ON_HOLD':
      return 'UNKNOWN'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(raw: SeflTrackingResponse): TrackingEvent[] {
  const result = raw?.result
  if (!result || !result.history || result.history.length === 0) {
    return [{
      trackingNumber: result?.proNumber ?? '',
      carrierId: 'sefl',
      status: 'UNKNOWN',
      metadata: (raw ?? {}) as Record<string, unknown>,
    }]
  }

  return result.history.map((evt) => ({
    trackingNumber: result.proNumber,
    carrierId: 'sefl',
    status: mapTrackingStatus(evt.statusCode),
    description: evt.statusDescription || undefined,
    location: (evt.city || evt.state)
      ? { city: evt.city ?? undefined, state: evt.state ?? undefined }
      : undefined,
    occurredAt: toISODate(evt.eventDateTime),
    metadata: evt as Record<string, unknown>,
  }))
}
