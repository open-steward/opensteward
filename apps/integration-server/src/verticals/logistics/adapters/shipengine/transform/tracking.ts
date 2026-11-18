import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface ShipEngineTrackingEvent {
  occurred_at?: string | null
  carrier_occurred_at?: string | null
  description?: string | null
  city_locality?: string | null
  state_province?: string | null
  postal_code?: string | null
  country_code?: string | null
  company_name?: string | null
  signer?: string | null
  event_code?: string | null
  carrier_detail_code?: string | null
  status_code?: string | null
  status_description?: string | null
  carrier_status_code?: string | null
  carrier_status_description?: string | null
  latitude?: number | null
  longitude?: number | null
  [key: string]: unknown
}

export interface ShipEngineTrackingInformation {
  tracking_number: string
  status_code: string
  status_description?: string | null
  carrier_status_code?: string | null
  carrier_status_description?: string | null
  ship_date?: string | null
  estimated_delivery_date?: string | null
  actual_delivery_date?: string | null
  exception_description?: string | null
  events?: ShipEngineTrackingEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(statusCode: string): TrackingEventStatus {
  // ShipEngine status codes: UN, AC, IT, OD, DE, AT, NT, EX, AN
  switch (statusCode?.toUpperCase()) {
    case 'UN': return 'UNKNOWN'
    case 'AC': return 'PRE_TRANSIT'
    case 'IT': return 'IN_TRANSIT'
    case 'OD': return 'OUT_FOR_DELIVERY'
    case 'DE': return 'DELIVERED'
    case 'AT': return 'AVAILABLE_FOR_PICKUP'
    case 'NT': return 'IN_TRANSIT'
    case 'EX': return 'FAILURE'
    case 'AN': return 'RETURN_TO_SENDER'
    default:   return 'UNKNOWN'
  }
}

function toTrackingLocation(event: ShipEngineTrackingEvent): Address | undefined {
  const hasAny =
    event.city_locality ||
    event.state_province ||
    event.country_code ||
    event.postal_code
  if (!hasAny) return undefined
  return {
    city: event.city_locality ?? undefined,
    state: event.state_province ?? undefined,
    country: event.country_code ?? undefined,
    postalCode: event.postal_code ?? undefined,
  }
}

export function transformTrackingInformation(
  raw: ShipEngineTrackingInformation,
): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((event) => ({
    trackingNumber: raw.tracking_number,
    status: mapTrackingStatus(event.status_code ?? raw.status_code),
    description:
      event.description ??
      event.carrier_status_description ??
      event.status_description ??
      undefined,
    location: toTrackingLocation(event),
    occurredAt:
      toISODate(event.occurred_at) ?? toISODate(event.carrier_occurred_at),
    createdAt: toISODate(raw.ship_date),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.tracking_number,
      status: mapTrackingStatus(raw.status_code),
      description:
        raw.status_description ??
        raw.carrier_status_description ??
        raw.exception_description ??
        undefined,
      createdAt: toISODate(raw.ship_date),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
