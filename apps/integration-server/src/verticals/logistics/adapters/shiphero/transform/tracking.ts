import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface ShipheroTrackingEvent {
  status: string
  description?: string | null
  date?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  zip?: string | null
  [key: string]: unknown
}

export interface ShipheroTrackingResponse {
  shipment_id?: string | null
  tracking_number?: string | null
  events?: ShipheroTrackingEvent[]
  [key: string]: unknown
}

function mapStatus(status: string): TrackingEventStatus {
  switch (status) {
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

export function transformTracking(raw: ShipheroTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []
  if (events.length === 0) {
    return [
      {
        shipmentId: raw.shipment_id ?? undefined,
        trackingNumber: raw.tracking_number ?? undefined,
        carrierId: 'shiphero',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'shiphero',
    status: mapStatus(evt.status),
    description: evt.description ?? undefined,
    location:
      evt.city || evt.state || evt.country || evt.zip
        ? {
            city: evt.city ?? undefined,
            state: evt.state ?? undefined,
            country: evt.country ?? undefined,
            postalCode: evt.zip ?? undefined,
          }
        : undefined,
    occurredAt: toISODate(evt.date),
    metadata: evt as Record<string, unknown>,
  }))
}
