import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ─── Raw Wonderment types ───────────────────────────────────────────────────

export interface WondermentTrackingEvent {
  date: string | null
  status: string | null
  locationDisplay: string | null
  [key: string]: unknown
}

export interface WondermentStatusDetails {
  status: string | null
  substatus: string | null
  [key: string]: unknown
}

export interface WondermentShipment {
  id?: string | null
  trackingCode?: string | null
  trackingNumber?: string | null
  orderName?: string | null
  orderId?: string | null
  carrierName?: string | null
  carrierService?: string | null
  carrierTrackingUrl?: string | null
  packageEta?: string | null
  statusDetails?: WondermentStatusDetails | null
  events?: WondermentTrackingEvent[] | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapStatus(raw: string | null | undefined): TrackingEventStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'PRE_TRANSIT':
    case 'SHIPMENT_CREATED':
    case 'CONFIRMED':
      return 'PRE_TRANSIT'
    case 'TRANSIT':
    case 'IN_TRANSIT':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'READY_FOR_PICKUP':
    case 'AVAILABLE_FOR_PICKUP':
      return 'AVAILABLE_FOR_PICKUP'
    case 'ATTEMPTED_DELIVERY':
    case 'SHIPMENT_STALLED':
    case 'RETURNED':
    case 'ERROR':
    case 'CANCELLED':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

// ─── Location helper ────────────────────────────────────────────────────────

/**
 * Wonderment returns free-text location as "City, ST" or "City, State, Country".
 * We parse it into a best-effort Address.
 */
function parseLocationDisplay(display: string | null | undefined): Address | undefined {
  if (!display) return undefined
  const parts = display.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return undefined
  if (parts.length === 1) return { city: parts[0] }
  if (parts.length === 2) return { city: parts[0], state: parts[1] }
  return { city: parts[0], state: parts[1], country: parts[2] }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipmentToTrackingEvents(raw: WondermentShipment): TrackingEvent[] {
  const trackingNumber = raw.trackingCode ?? raw.trackingNumber ?? undefined
  const carrierId = raw.carrierName ?? undefined
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId,
    status: mapStatus(evt.status),
    description: evt.status ?? undefined,
    location: parseLocationDisplay(evt.locationDisplay),
    occurredAt: toISODate(evt.date),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId,
      status: mapStatus(raw.statusDetails?.status),
      description: raw.statusDetails?.status ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
