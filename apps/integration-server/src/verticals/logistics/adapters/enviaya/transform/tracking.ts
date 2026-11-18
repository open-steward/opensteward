import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface EnviaYaTrackingEvent {
  event_code?: string | null
  event_description?: string | null
  status_code?: string | number | null
  shipment_status?: string | null
  delivery_date?: string | null
  expected_delivery_date?: string | null
  datetime?: string | null
  location?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postal_code?: string | null
  [key: string]: unknown
}

export interface EnviaYaTracking {
  carrier?: string | null
  shipment_number?: string | null
  carrier_shipment_number?: string | null
  enviaya_shipment_number?: string | null
  shipment_status?: string | null
  delivery_date?: string | null
  expected_delivery_date?: string | null
  event_code?: string | null
  event_description?: string | null
  tracking_events?: EnviaYaTrackingEvent[] | null
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pre_transit':
    case 'label_created':
    case 'booked':
      return 'PRE_TRANSIT'
    case 'in_transit':
    case 'transit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'available_for_pickup':
      return 'AVAILABLE_FOR_PICKUP'
    case 'returned':
    case 'return_to_sender':
      return 'RETURN_TO_SENDER'
    case 'exception':
    case 'error':
    case 'failure':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

function toLocation(event: EnviaYaTrackingEvent): Address | undefined {
  const city = event.city ?? null
  const state = event.state ?? null
  const country = event.country ?? null
  const postalCode = event.postal_code ?? null
  if (!city && !state && !country && !postalCode) return undefined
  return {
    city: city ?? undefined,
    state: state ?? undefined,
    country: country ?? undefined,
    postalCode: postalCode ?? undefined,
  }
}

export function transformTracking(raw: EnviaYaTracking): TrackingEvent[] {
  const trackingNumber =
    raw.shipment_number ?? raw.carrier_shipment_number ?? raw.enviaya_shipment_number ?? undefined
  const carrierId = raw.carrier ?? undefined

  const events = raw.tracking_events ?? []

  if (events.length > 0) {
    return events.map((evt): TrackingEvent => ({
      trackingNumber,
      carrierId,
      status: mapTrackingStatus(evt.shipment_status ?? raw.shipment_status),
      description: evt.event_description ?? undefined,
      location: toLocation(evt),
      occurredAt: toISODate(evt.datetime ?? evt.delivery_date),
      createdAt: toISODate(raw.delivery_date),
      metadata: raw as Record<string, unknown>,
    }))
  }

  // Single summary event when no detail events returned
  return [
    {
      trackingNumber,
      carrierId,
      status: mapTrackingStatus(raw.shipment_status),
      description: raw.event_description ?? undefined,
      occurredAt: toISODate(raw.delivery_date ?? raw.expected_delivery_date),
      createdAt: toISODate(raw.delivery_date),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
