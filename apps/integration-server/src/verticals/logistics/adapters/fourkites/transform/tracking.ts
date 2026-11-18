import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── FourKites raw types ───────────────────────────────────────────────────

export interface FourKitesTrackingStop {
  status: string
  description: string | null
  timestamp: string
  location: {
    city: string | null
    state: string | null
    country: string | null
  } | null
  [key: string]: unknown
}

export interface FourKitesTracking {
  loadId: string
  carrierName: string | null
  currentStatus: string | null
  stops: FourKitesTrackingStop[]
  estimatedDeliveryDate: string | null
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'DISPATCHED':          return 'PRE_TRANSIT'
    case 'PICKED_UP':           return 'PRE_TRANSIT'
    case 'IN_TRANSIT':          return 'IN_TRANSIT'
    case 'AT_STOP':             return 'IN_TRANSIT'
    case 'DELIVERED':           return 'DELIVERED'
    case 'DELAYED':             return 'FAILURE'
    case 'CANCELLED':           return 'FAILURE'
    default:                    return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformTracking(
  raw: FourKitesTracking,
): TrackingEvent[] {
  const trackingNumber = raw.loadId

  const events: TrackingEvent[] = (raw.stops ?? []).map((stop) => ({
    trackingNumber,
    carrierId: 'fourkites',
    status: mapTrackingStatus(stop.status),
    description: stop.description || undefined,
    location: stop.location
      ? {
          city: stop.location.city ?? undefined,
          state: stop.location.state ?? undefined,
          country: stop.location.country ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(stop.timestamp),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'fourkites',
      status: raw.currentStatus ? mapTrackingStatus(raw.currentStatus) : 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
