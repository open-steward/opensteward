import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface McfTrackingEvent {
  eventCode: string
  eventDate: string
  eventDescription?: string | null
  eventAddress?: {
    city?: string | null
    stateOrRegion?: string | null
    countryCode?: string | null
    postalCode?: string | null
  } | null
  [key: string]: unknown
}

export interface McfTrackingResponse {
  sellerFulfillmentOrderId?: string
  packageNumber?: string
  trackingNumber?: string
  carrierCode?: string | null
  customerTrackingLink?: string | null
  trackingEvents?: McfTrackingEvent[]
  [key: string]: unknown
}

export function mapMcfTrackingStatus(
  eventCode: string | null | undefined,
): TrackingEventStatus {
  switch (eventCode) {
    case 'EVENT_101': // Shipment information sent to carrier
    case 'Pickup':
      return 'PRE_TRANSIT'
    case 'EVENT_102': // Shipment picked up from seller's facility
    case 'EVENT_201': // Arrival scan
    case 'EVENT_202': // Departure scan
    case 'InTransit':
      return 'IN_TRANSIT'
    case 'EVENT_204': // Out for delivery
    case 'OutForDelivery':
      return 'OUT_FOR_DELIVERY'
    case 'EVENT_301': // Delivered
    case 'Delivered':
      return 'DELIVERED'
    case 'EVENT_302': // Delivery attempted
    case 'EVENT_304': // Delayed or undeliverable
    case 'Exception':
      return 'FAILURE'
    case 'EVENT_308': // Returned to seller
    case 'Returned':
      return 'RETURN_TO_SENDER'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(raw: McfTrackingResponse): TrackingEvent[] {
  const events = raw.trackingEvents ?? []

  if (events.length === 0) {
    return [
      {
        shipmentId: raw.sellerFulfillmentOrderId ?? undefined,
        trackingNumber: raw.trackingNumber ?? undefined,
        carrierId: 'amazon-mcf',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId: raw.sellerFulfillmentOrderId ?? undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'amazon-mcf',
    status: mapMcfTrackingStatus(evt.eventCode),
    description: evt.eventDescription ?? undefined,
    location: evt.eventAddress
      ? {
          city: evt.eventAddress.city ?? undefined,
          state: evt.eventAddress.stateOrRegion ?? undefined,
          country: evt.eventAddress.countryCode ?? undefined,
          postalCode: evt.eventAddress.postalCode ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(evt.eventDate),
    metadata: evt as Record<string, unknown>,
  }))
}
