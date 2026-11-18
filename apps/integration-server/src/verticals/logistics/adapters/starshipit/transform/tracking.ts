import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface StarshipitTrackingEvent {
  description?: string | null
  status?: string | null
  status_code?: string | null
  date?: string | null
  datetime?: string | null
  location?: string | null
  suburb?: string | null
  state?: string | null
  postcode?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface StarshipitTracking {
  tracking_number?: string | null
  carrier_name?: string | null
  carrier_code?: string | null
  order_id?: string | number | null
  status?: string | null
  events?: StarshipitTrackingEvent[] | null
  tracking_events?: StarshipitTrackingEvent[] | null
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pre_transit':
    case 'pre-transit':
    case 'pending':
    case 'new':
      return 'PRE_TRANSIT'
    case 'in_transit':
    case 'in-transit':
    case 'transit':
    case 'shipped':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'out-for-delivery':
    case 'with_driver':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'available_for_pickup':
    case 'held':
      return 'AVAILABLE_FOR_PICKUP'
    case 'returned':
    case 'return_to_sender':
    case 'return':
      return 'RETURN_TO_SENDER'
    case 'failed':
    case 'exception':
    case 'undeliverable':
    case 'error':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

function toTrackingLocation(evt: StarshipitTrackingEvent): Address | undefined {
  const city = evt.suburb ?? evt.location ?? undefined
  const state = evt.state ?? undefined
  const postalCode = evt.postcode ?? undefined
  const country = evt.country ?? undefined
  if (!city && !state && !postalCode && !country) return undefined
  return { city, state, postalCode, country }
}

export function transformTracking(raw: StarshipitTracking): TrackingEvent[] {
  const events = raw.events ?? raw.tracking_events ?? []

  const mapped: TrackingEvent[] = events.map((evt) => ({
    shipmentId: raw.order_id != null ? String(raw.order_id) : undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier_code ?? raw.carrier_name ?? undefined,
    status: mapTrackingStatus(evt.status ?? evt.status_code),
    description: evt.description ?? undefined,
    location: toTrackingLocation(evt),
    occurredAt: toISODate(evt.datetime ?? evt.date),
    metadata: raw as Record<string, unknown>,
  }))

  if (mapped.length === 0) {
    return [
      {
        shipmentId: raw.order_id != null ? String(raw.order_id) : undefined,
        trackingNumber: raw.tracking_number ?? undefined,
        carrierId: raw.carrier_code ?? raw.carrier_name ?? undefined,
        status: mapTrackingStatus(raw.status),
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return mapped
}
