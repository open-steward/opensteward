import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── SMSA raw types ────────────────────────────────────────────────────────

export interface SmsaTrackingActivity {
  activity: string
  detail: string | null
  date: string
  location: string | null
  [key: string]: unknown
}

export interface SmsaTracking {
  awbno: string
  status: string | null
  activities: SmsaTrackingActivity[]
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapTrackingStatus(activity: string): TrackingEventStatus {
  switch (activity) {
    case 'RECEIVED':            return 'PRE_TRANSIT'
    case 'IN_HUB':              return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':    return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':           return 'DELIVERED'
    case 'NOT_DELIVERED':       return 'FAILURE'
    case 'RETURNED':            return 'RETURN_TO_SENDER'
    case 'HELD':                return 'AVAILABLE_FOR_PICKUP'
    default:                    return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformTracking(
  raw: SmsaTracking,
  trackingNumber: string,
): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.activities ?? []).map((act) => ({
    trackingNumber,
    carrierId: 'smsa',
    status: mapTrackingStatus(act.activity),
    description: act.detail || undefined,
    location: act.location
      ? { city: act.location }
      : undefined,
    occurredAt: toISODate(act.date),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'smsa',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
