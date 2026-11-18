import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface ShipperhqTrackingEvent {
  status: string
  description?: string | null
  occurredAt?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postalCode?: string | null
  [key: string]: unknown
}

export interface ShipperhqTrackingResponse {
  shipmentId?: string
  trackingNumber?: string | null
  events?: ShipperhqTrackingEvent[]
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

export function transformTracking(raw: ShipperhqTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []
  if (events.length === 0) {
    return [
      {
        shipmentId: raw.shipmentId ?? undefined,
        trackingNumber: raw.trackingNumber ?? undefined,
        carrierId: 'shipperhq',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'shipperhq',
    status: mapStatus(evt.status),
    description: evt.description ?? undefined,
    location:
      evt.city || evt.state || evt.country || evt.postalCode
        ? {
            city: evt.city ?? undefined,
            state: evt.state ?? undefined,
            country: evt.country ?? undefined,
            postalCode: evt.postalCode ?? undefined,
          }
        : undefined,
    occurredAt: toISODate(evt.occurredAt),
    metadata: evt as Record<string, unknown>,
  }))
}
