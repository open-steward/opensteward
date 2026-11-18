import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'

// ─── Raw API types ───────────────────────────────────────────────────────────

export interface TcsTrackingEvent {
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
  event_time?: string
  [key: string]: unknown
}

export interface TcsShipment {
  id?: string | number
  consignment_number?: string
  tracking_number?: string
  status?: string
  events?: TcsTrackingEvent[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface TcsApiResponse<T> {
  success?: boolean
  data?: T
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'BOOKED':
    case 'PENDING':
    case 'CREATED':
      return 'PRE_TRANSIT'
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'DISPATCHED':
    case 'IN_WAREHOUSE':
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
    case 'RETURN_IN_TRANSIT':
      return 'RETURN_TO_SENDER'
    case 'FAILED':
    case 'UNDELIVERED':
    case 'CANCELLED':
    case 'LOST':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformTrackingEvent(
  raw: TcsTrackingEvent,
  shipmentId?: string,
  trackingNumber?: string,
): TrackingEvent {
  const ts = raw.timestamp ?? raw.event_time
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    shipmentId: raw.shipment_id ?? shipmentId,
    trackingNumber: raw.tracking_number ?? trackingNumber,
    carrierId: 'tcs-express',
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
 * Transform a TCS Express shipment into an array of tracking events.
 * If the shipment contains an events array, each entry is transformed.
 * Otherwise a single synthetic event is derived from the shipment's current status.
 */
export function transformTracking(raw: TcsShipment): TrackingEvent[] {
  const shipmentId = raw.id != null ? String(raw.id) : undefined
  const trackingNumber = raw.consignment_number ?? raw.tracking_number

  if (Array.isArray(raw.events) && raw.events.length > 0) {
    return raw.events.map((ev) => transformTrackingEvent(ev, shipmentId, trackingNumber))
  }

  return [
    {
      shipmentId,
      trackingNumber,
      carrierId: 'tcs-express',
      status: mapTrackingStatus(raw.status),
      occurredAt: raw.updated_at ? new Date(raw.updated_at) : raw.created_at ? new Date(raw.created_at) : undefined,
      metadata: raw as Record<string, unknown>,
    },
  ]
}
