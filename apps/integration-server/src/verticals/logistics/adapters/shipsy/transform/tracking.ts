import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'

// ─── Raw API types ───────────────────────────────────────────────────────────

export interface ShipsyTrackingEvent {
  id?: string | number
  shipment_id?: string
  tracking_number?: string
  status?: string
  description?: string
  location?: string
  city?: string
  state?: string
  country?: string
  timestamp?: string
  created_at?: string
  [key: string]: unknown
}

export interface ShipsyShipment {
  id?: string | number
  shipment_id?: string
  tracking_number?: string
  status?: string
  events?: ShipsyTrackingEvent[]
  origin_city?: string
  destination_city?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'PENDING':
    case 'CREATED':
    case 'BOOKED':
      return 'PRE_TRANSIT'
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'DISPATCHED':
    case 'ARRIVED':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'AVAILABLE_FOR_PICKUP':
      return 'AVAILABLE_FOR_PICKUP'
    case 'RETURNED':
    case 'RTO':
      return 'RETURN_TO_SENDER'
    case 'FAILED':
    case 'UNDELIVERED':
    case 'CANCELLED':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformTrackingEvent(
  raw: ShipsyTrackingEvent,
  shipmentId?: string,
  trackingNumber?: string,
): TrackingEvent {
  const ts = raw.timestamp ?? raw.created_at
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    shipmentId: raw.shipment_id ?? shipmentId,
    trackingNumber: raw.tracking_number ?? trackingNumber,
    carrierId: 'shipsy',
    status: mapTrackingStatus(raw.status),
    description: raw.description,
    location:
      raw.city || raw.state || raw.country
        ? {
            city: raw.city,
            state: raw.state,
            country: raw.country as string | undefined,
          }
        : raw.location
          ? { street1: raw.location }
          : undefined,
    occurredAt: ts ? new Date(ts) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Transform a Shipsy shipment response into an array of tracking events.
 * If the shipment contains an events array, each entry is transformed.
 * Otherwise a single synthetic event is derived from the shipment's current status.
 */
export function transformTracking(raw: ShipsyShipment): TrackingEvent[] {
  const shipmentId = raw.shipment_id ?? (raw.id != null ? String(raw.id) : undefined)
  const trackingNumber = raw.tracking_number

  if (Array.isArray(raw.events) && raw.events.length > 0) {
    return raw.events.map((ev) => transformTrackingEvent(ev, shipmentId, trackingNumber))
  }

  return [
    {
      shipmentId,
      trackingNumber,
      carrierId: 'shipsy',
      status: mapTrackingStatus(raw.status),
      occurredAt: raw.updated_at ? new Date(raw.updated_at) : raw.created_at ? new Date(raw.created_at) : undefined,
      metadata: raw as Record<string, unknown>,
    },
  ]
}
