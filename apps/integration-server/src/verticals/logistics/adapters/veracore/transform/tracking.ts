import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface VeraCoreTrackingEvent {
  Status?: string | null
  Description?: string | null
  EventDate?: string | null
  EventDateTime?: string | null
  City?: string | null
  State?: string | null
  Country?: string | null
  PostalCode?: string | null
  [key: string]: unknown
}

/**
 * Raw VeraCore tracking response as returned by GET /v1/tracking/{trackingNumber}.
 */
export interface VeraCoreTrackingResponse {
  ShipmentID?: string | number | null
  TrackingNumber?: string | null
  CarrierCode?: string | null
  Events?: VeraCoreTrackingEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('pre_transit') || s.includes('order received') || s.includes('picked up')) {
    return 'PRE_TRANSIT'
  }
  if (s.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (s.includes('delivered')) return 'DELIVERED'
  if (s.includes('available for pickup')) return 'AVAILABLE_FOR_PICKUP'
  if (s.includes('return to sender') || s.includes('returned')) return 'RETURN_TO_SENDER'
  if (s.includes('exception') || s.includes('failed') || s.includes('error')) return 'FAILURE'
  if (
    s.includes('in transit') ||
    s.includes('transit') ||
    s.includes('shipped') ||
    s.includes('departed') ||
    s.includes('arrived') ||
    s.includes('processed')
  ) {
    return 'IN_TRANSIT'
  }
  return 'UNKNOWN'
}

export function transformTracking(raw: VeraCoreTrackingResponse): TrackingEvent[] {
  const events = raw.Events ?? []
  const carrierId = raw.CarrierCode ?? 'veracore'
  const shipmentId = raw.ShipmentID != null ? String(raw.ShipmentID) : undefined
  const trackingNumber = raw.TrackingNumber ?? undefined

  if (events.length === 0) {
    return [
      {
        shipmentId,
        trackingNumber,
        carrierId,
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId,
    trackingNumber,
    carrierId,
    status: mapTrackingStatus(evt.Status),
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
    occurredAt: toISODate(evt.EventDateTime ?? evt.EventDate),
    metadata: evt as Record<string, unknown>,
  }))
}
