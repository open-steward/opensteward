import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// --- Lime Express raw types ------------------------------------------------

export interface LimeExpressTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  [key: string]: unknown
}

export interface LimeExpressTracking {
  trackingNumber: string
  currentStatus: string | null
  events: LimeExpressTrackingEvent[]
  [key: string]: unknown
}

// --- Status mapping --------------------------------------------------------

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'RECIBIDO':            return 'PRE_TRANSIT'
    case 'EN_TRANSITO':         return 'IN_TRANSIT'
    case 'EN_REPARTO':          return 'OUT_FOR_DELIVERY'
    case 'ENTREGADO':           return 'DELIVERED'
    case 'NO_ENTREGADO':        return 'FAILURE'
    case 'DEVUELTO':            return 'RETURN_TO_SENDER'
    default:                    return 'UNKNOWN'
  }
}

// --- Transform -------------------------------------------------------------

export function transformTracking(
  raw: LimeExpressTracking,
  trackingNumber: string,
): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'limeexpress',
    status: mapTrackingStatus(evt.status),
    description: evt.description || undefined,
    location: evt.location
      ? { city: evt.location }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'limeexpress',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
