import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface ShipmonkTrackingEvent {
  type: string
  message?: string | null
  timestamp?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postal_code?: string | null
  [key: string]: unknown
}

export interface ShipmonkTrackingResponse {
  shipment_id?: string
  tracking_number?: string | null
  events?: ShipmonkTrackingEvent[]
  [key: string]: unknown
}

function mapStatus(type: string): TrackingEventStatus {
  switch (type) {
    case 'Order Received':    return 'PRE_TRANSIT'
    case 'Picked':            return 'PRE_TRANSIT'
    case 'Packed':            return 'PRE_TRANSIT'
    case 'Shipped':           return 'IN_TRANSIT'
    case 'Out for Delivery':  return 'OUT_FOR_DELIVERY'
    case 'Delivered':         return 'DELIVERED'
    case 'Exception':         return 'FAILURE'
    case 'Returned':          return 'RETURN_TO_SENDER'
    default:                  return 'UNKNOWN'
  }
}

export function transformTracking(raw: ShipmonkTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []
  if (events.length === 0) {
    return [
      {
        shipmentId: raw.shipment_id ?? undefined,
        trackingNumber: raw.tracking_number ?? undefined,
        carrierId: 'shipmonk',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'shipmonk',
    status: mapStatus(evt.type),
    description: evt.message ?? undefined,
    location:
      evt.city || evt.state || evt.country || evt.postal_code
        ? {
            city: evt.city ?? undefined,
            state: evt.state ?? undefined,
            country: evt.country ?? undefined,
            postalCode: evt.postal_code ?? undefined,
          }
        : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))
}
