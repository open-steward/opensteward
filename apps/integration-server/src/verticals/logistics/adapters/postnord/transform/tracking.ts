import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── PostNord raw types ─────────────────────────────────────────────────────

export interface PostNordTrackingEvent {
  eventCode: string
  status: string | null
  description: string | null
  eventTime: string
  location: {
    displayName: string | null
    city: string | null
    country: string | null
    postcode: string | null
  } | null
  [key: string]: unknown
}

export interface PostNordShipmentItem {
  itemId: string
  status: string | null
  events: PostNordTrackingEvent[]
  [key: string]: unknown
}

export interface PostNordTrackingResponse {
  TrackingInformationResponse: {
    shipments: Array<{
      shipmentId: string
      status: string | null
      items: PostNordShipmentItem[]
      [key: string]: unknown
    }>
  }
}

// ─── Status mapping ─────────────────────────────────────────────────────────

/**
 * PostNord uses both event codes and human-readable status strings. We map by
 * event code primarily, with status string as fallback.
 */
function mapTrackingStatus(eventCode: string, status: string | null): TrackingEventStatus {
  switch (eventCode) {
    case 'INFORMED':
    case 'EN_ROUTE':           return 'PRE_TRANSIT'
    case 'DELIVERY':           return 'IN_TRANSIT'
    case 'DELIVERY_REFUSED':   return 'FAILURE'
    case 'OTHER':              return 'UNKNOWN'
    case 'AVAILABLE_FOR_DELIVERY': return 'AVAILABLE_FOR_PICKUP'
    case 'DELIVERED':          return 'DELIVERED'
    case 'RETURNED':           return 'RETURN_TO_SENDER'
    case 'STOPPED':
    case 'EXCEPTION':          return 'FAILURE'
    case 'OUT_FOR_DELIVERY':   return 'OUT_FOR_DELIVERY'
    default: break
  }

  switch (status) {
    case 'INFORMED':           return 'PRE_TRANSIT'
    case 'EN_ROUTE':           return 'IN_TRANSIT'
    case 'AVAILABLE_FOR_DELIVERY': return 'AVAILABLE_FOR_PICKUP'
    case 'DELIVERED':          return 'DELIVERED'
    case 'RETURNED':           return 'RETURN_TO_SENDER'
    case 'STOPPED':            return 'FAILURE'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: PostNordTrackingResponse): TrackingEvent[] {
  const shipments = raw.TrackingInformationResponse?.shipments ?? []
  const result: TrackingEvent[] = []

  for (const shipment of shipments) {
    for (const item of shipment.items ?? []) {
      const events = item.events ?? []

      if (events.length === 0) {
        result.push({
          shipmentId: shipment.shipmentId ?? undefined,
          trackingNumber: item.itemId ?? undefined,
          carrierId: 'postnord',
          status: mapTrackingStatus('', item.status),
          metadata: item as Record<string, unknown>,
        })
        continue
      }

      for (const evt of events) {
        result.push({
          shipmentId: shipment.shipmentId ?? undefined,
          trackingNumber: item.itemId ?? undefined,
          carrierId: 'postnord',
          status: mapTrackingStatus(evt.eventCode, evt.status),
          description: evt.description || undefined,
          location: evt.location
            ? {
                city: evt.location.city ?? evt.location.displayName ?? undefined,
                country: evt.location.country ?? undefined,
                postalCode: evt.location.postcode ?? undefined,
              }
            : undefined,
          occurredAt: toISODate(evt.eventTime),
          metadata: evt as Record<string, unknown>,
        })
      }
    }
  }

  return result
}
