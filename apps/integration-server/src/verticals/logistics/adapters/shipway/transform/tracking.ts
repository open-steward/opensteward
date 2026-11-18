import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface ShipwayTrackingEventRaw {
  status?: string | null
  description?: string | null
  timestamp?: string | null
  location?: string | null
  city?: string | null
  country?: string | null
  postal_code?: string | null
  [key: string]: unknown
}

export interface ShipwayTrackingResponse {
  tracking_number?: string
  shipment_id?: string
  status?: string | null
  events?: ShipwayTrackingEventRaw[]
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s.includes('DELIVERED')) return 'DELIVERED'
  if (s.includes('OUT_FOR_DELIVERY') || s.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY'
  if (s.includes('PICKUP') || s.includes('AVAILABLE')) return 'AVAILABLE_FOR_PICKUP'
  if (s.includes('RETURN')) return 'RETURN_TO_SENDER'
  if (s.includes('FAIL') || s.includes('EXCEPTION') || s.includes('REFUSED')) return 'FAILURE'
  if (s.includes('TRANSIT') || s.includes('IN_TRANSIT')) return 'IN_TRANSIT'
  if (s.includes('CREATED') || s.includes('MANIFEST') || s.includes('PRE') || s.includes('LABEL')) return 'PRE_TRANSIT'
  return 'UNKNOWN'
}

export function transformTracking(raw: ShipwayTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []
  if (events.length === 0) {
    return [{
      shipmentId: raw.shipment_id ?? undefined,
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: 'shipway',
      status: mapStatus(raw.status ?? null),
      metadata: raw as Record<string, unknown>,
    }]
  }
  return events.map((evt) => ({
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'shipway',
    status: mapStatus(evt.status ?? null),
    description: evt.description ?? undefined,
    location: (evt.city || evt.country || evt.postal_code || evt.location)
      ? {
          city: evt.city ?? evt.location ?? undefined,
          country: evt.country ?? undefined,
          postalCode: evt.postal_code ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))
}
