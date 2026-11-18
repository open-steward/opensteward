import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * Shipium tracking event object returned by GET /tracking/{id} and bulk endpoints.
 */
export interface ShipiumTrackingEventRaw {
  carrierDescription?: string | null
  shipmentStatus?: string | null
  eventDate?: string | null
  postalCode?: string | null
  country?: string | null
  city?: string | null
  region?: string | null
  [key: string]: unknown
}

export interface ShipiumTrackingResponse {
  shipiumTrackingId?: string | null
  shipiumShipmentId?: string | null
  carrierId?: string | null
  carrierTrackingId?: string | null
  carrierServiceMethodId?: string | null
  shipmentStatus?: string | null
  shippedDateTime?: string | null
  deliveredAtDateTime?: string | null
  carrierEstimatedDeliveryDate?: string | null
  partnerReferenceId?: string | null
  carrierTrackingLink?: string | null
  trackingEvents?: ShipiumTrackingEventRaw[] | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'registered':
    case 'label printed':
    case 'label_printed':
      return 'PRE_TRANSIT'
    case 'in transit':
    case 'in_transit':
      return 'IN_TRANSIT'
    case 'out for delivery':
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'exception':
      return 'FAILURE'
    case 'return to sender':
    case 'return_to_sender':
      return 'RETURN_TO_SENDER'
    case 'available for pickup':
    case 'available_for_pickup':
      return 'AVAILABLE_FOR_PICKUP'
    default:
      return 'UNKNOWN'
  }
}

function toEventLocation(evt: ShipiumTrackingEventRaw): Address | undefined {
  const hasAny = evt.city || evt.region || evt.country || evt.postalCode
  if (!hasAny) return undefined
  return {
    city: evt.city ?? undefined,
    state: evt.region ?? undefined,
    country: (evt.country ?? undefined) as Address['country'],
    postalCode: evt.postalCode ?? undefined,
  }
}

export function transformTrackingResponse(raw: ShipiumTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.trackingEvents ?? []).map((evt) => ({
    shipmentId: raw.shipiumShipmentId ?? undefined,
    trackingNumber: raw.carrierTrackingId ?? undefined,
    carrierId: raw.carrierId ?? undefined,
    status: mapShipmentStatus(evt.shipmentStatus),
    description: evt.carrierDescription ?? undefined,
    location: toEventLocation(evt),
    occurredAt: toISODate(evt.eventDate),
    createdAt: toISODate(raw.shippedDateTime),
    metadata: raw as Record<string, unknown>,
  }))

  // Always include a top-level summary event (most-recent status from the response)
  if (events.length === 0) {
    events.push({
      shipmentId: raw.shipiumShipmentId ?? undefined,
      trackingNumber: raw.carrierTrackingId ?? undefined,
      carrierId: raw.carrierId ?? undefined,
      status: mapShipmentStatus(raw.shipmentStatus),
      occurredAt: toISODate(raw.deliveredAtDateTime ?? raw.shippedDateTime),
      createdAt: toISODate(raw.shippedDateTime),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
