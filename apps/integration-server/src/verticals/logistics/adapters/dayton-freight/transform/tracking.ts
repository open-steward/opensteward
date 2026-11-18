import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface DaytonTrackingActivity {
  activityCode: string
  activityDescription: string
  activityDateTime: string | null
  terminalCity: string | null
  terminalState: string | null
  [key: string]: unknown
}

export interface DaytonTrackingShipment {
  proNumber: string
  status: string | null
  activities: DaytonTrackingActivity[]
  [key: string]: unknown
}

export interface DaytonTrackingResponse {
  shipment: DaytonTrackingShipment | null
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
    case 'DEL':
    case 'DELIVERED':
      return 'DELIVERED'
    case 'EXC':
    case 'EXCEPTION':
      return 'FAILURE'
    case 'HLD':
    case 'ON_HOLD':
      return 'UNKNOWN'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(raw: DaytonTrackingResponse): TrackingEvent[] {
  const shipment = raw?.shipment
  if (!shipment || !shipment.activities || shipment.activities.length === 0) {
    return [{
      trackingNumber: shipment?.proNumber ?? '',
      carrierId: 'dayton-freight',
      status: 'UNKNOWN',
      metadata: (raw ?? {}) as Record<string, unknown>,
    }]
  }

  return shipment.activities.map((evt) => ({
    trackingNumber: shipment.proNumber,
    carrierId: 'dayton-freight',
    status: mapTrackingStatus(evt.activityCode),
    description: evt.activityDescription || undefined,
    location: (evt.terminalCity || evt.terminalState)
      ? { city: evt.terminalCity ?? undefined, state: evt.terminalState ?? undefined }
      : undefined,
    occurredAt: toISODate(evt.activityDateTime),
    metadata: evt as Record<string, unknown>,
  }))
}
