import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface USPSTrackingEvent {
  eventType: string
  eventTimestamp: string
  eventCountry: string | null
  eventCity: string | null
  eventState: string | null
  eventZIP: string | null
  firm: string | null
  [key: string]: unknown
}

export interface USPSTrackingResponse {
  destinationCity: string | null
  destinationState: string | null
  destinationZIP: string | null
  mailClass: string | null
  status: string | null
  statusCategory: string | null
  statusSummary: string | null
  trackingEvents: USPSTrackingEvent[]
  [key: string]: unknown
}

function mapStatusCategory(category: string): TrackingEventStatus {
  switch (category) {
    case 'Pre-Shipment':          return 'PRE_TRANSIT'
    case 'Accepted':              return 'IN_TRANSIT'
    case 'In Transit':            return 'IN_TRANSIT'
    case 'Out for Delivery':      return 'OUT_FOR_DELIVERY'
    case 'Delivered':             return 'DELIVERED'
    case 'Available for Pickup':  return 'AVAILABLE_FOR_PICKUP'
    case 'Return to Sender':      return 'RETURN_TO_SENDER'
    case 'Alert':                 return 'FAILURE'
    default:                      return 'UNKNOWN'
  }
}

function toEventLocation(event: USPSTrackingEvent): Address | undefined {
  const hasAny = event.eventCity || event.eventState || event.eventZIP || event.eventCountry
  if (!hasAny) return undefined
  return {
    city: event.eventCity ?? undefined,
    state: event.eventState ?? undefined,
    postalCode: event.eventZIP ?? undefined,
    country: event.eventCountry ?? undefined,
  }
}

export function transformTracking(raw: USPSTrackingResponse, trackingNumber: string): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.trackingEvents ?? []).map((event) => ({
    trackingNumber,
    carrierId: 'usps',
    status: mapStatusCategory(raw.statusCategory ?? ''),
    description: event.eventType || undefined,
    location: toEventLocation(event),
    occurredAt: toISODate(event.eventTimestamp),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0 && raw.statusCategory) {
    events.push({
      trackingNumber,
      carrierId: 'usps',
      status: mapStatusCategory(raw.statusCategory),
      description: raw.statusSummary ?? raw.status ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
