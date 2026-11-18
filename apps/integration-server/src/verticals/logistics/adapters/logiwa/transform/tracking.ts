import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface LogiwaTrackingEvent {
  Status: string
  Description?: string | null
  EventDate?: string | null
  City?: string | null
  State?: string | null
  Country?: string | null
  PostalCode?: string | null
  [key: string]: unknown
}

export interface LogiwaTrackingResponse {
  ShipmentID?: string | number
  TrackingNumber?: string | null
  Events?: LogiwaTrackingEvent[]
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

export function transformTracking(raw: LogiwaTrackingResponse): TrackingEvent[] {
  const events = raw.Events ?? []
  if (events.length === 0) {
    return [
      {
        shipmentId: raw.ShipmentID != null ? String(raw.ShipmentID) : undefined,
        trackingNumber: raw.TrackingNumber ?? undefined,
        carrierId: 'logiwa',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId: raw.ShipmentID != null ? String(raw.ShipmentID) : undefined,
    trackingNumber: raw.TrackingNumber ?? undefined,
    carrierId: 'logiwa',
    status: mapStatus(evt.Status),
    description: evt.Description ?? undefined,
    location:
      evt.City || evt.State || evt.Country || evt.PostalCode
        ? {
            city: evt.City ?? undefined,
            state: evt.State ?? undefined,
            country: evt.Country ?? undefined,
            postalCode: evt.PostalCode ?? undefined,
          }
        : undefined,
    occurredAt: toISODate(evt.EventDate),
    metadata: evt as Record<string, unknown>,
  }))
}
