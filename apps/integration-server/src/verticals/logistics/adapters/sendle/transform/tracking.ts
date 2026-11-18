import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Sendle raw types ────────────────────────────────────────────────────────

export interface SendleTrackingEvent {
  event_type: string
  scan_time: string
  description: string
  reason: string | null
  origin_location: string | null
  destination_location: string | null
}

export interface SendleTracking {
  state: string
  tracking_events: SendleTrackingEvent[]
  origin: { country: string } | null
  destination: { country: string } | null
  [key: string]: unknown
}

// ─── Event type mapping ──────────────────────────────────────────────────────

function mapEventType(eventType: string): TrackingEventStatus {
  switch (eventType) {
    case 'Pickup':
    case 'Drop Off':
    case 'Dropped Off':           return 'PRE_TRANSIT'
    case 'In Transit':
    case 'Transit':               return 'IN_TRANSIT'
    case 'Out for Delivery':      return 'OUT_FOR_DELIVERY'
    case 'Delivered':
    case 'Local Delivery':        return 'DELIVERED'
    case 'Card Left':
    case 'Left with Agent':       return 'AVAILABLE_FOR_PICKUP'
    case 'Unable to Deliver':
    case 'Damaged':
    case 'Delivery Attempted':
    case 'Expired':               return 'FAILURE'
    default:                      return 'UNKNOWN'
  }
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformTracking(
  raw: SendleTracking,
  sendleReference: string,
): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.tracking_events ?? []).map((evt) => ({
    trackingNumber: sendleReference,
    carrierId: 'sendle',
    status: mapEventType(evt.event_type),
    description: evt.description || undefined,
    location: evt.origin_location
      ? { city: evt.origin_location }
      : undefined,
    occurredAt: toISODate(evt.scan_time),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: sendleReference,
      carrierId: 'sendle',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
