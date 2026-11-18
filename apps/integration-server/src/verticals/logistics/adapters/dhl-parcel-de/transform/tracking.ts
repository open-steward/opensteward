import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface DhlParcelDeTrackingEvent {
  timestamp: string
  status: string | null
  statusCode: string | null
  description: string | null
  location?: {
    address?: {
      addressLocality?: string | null
      countryCode?: string | null
      postalCode?: string | null
    } | null
  } | null
  [key: string]: unknown
}

export interface DhlParcelDeShipmentBlock {
  id: string
  status?: string | null
  events: DhlParcelDeTrackingEvent[]
  [key: string]: unknown
}

export interface DhlParcelDeTrackingResponse {
  shipments: DhlParcelDeShipmentBlock[]
}

function mapTrackingStatus(code: string | null, status: string | null): TrackingEventStatus {
  const key = (code || status || '').toLowerCase()
  switch (key) {
    case 'pre-transit':
    case 'pretransit':
    case 'label_created':          return 'PRE_TRANSIT'
    case 'transit':
    case 'in_transit':             return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'with_delivery_courier':  return 'OUT_FOR_DELIVERY'
    case 'delivered':              return 'DELIVERED'
    case 'available_for_pickup':   return 'AVAILABLE_FOR_PICKUP'
    case 'return_to_sender':
    case 'returned':               return 'RETURN_TO_SENDER'
    case 'failure':
    case 'exception':              return 'FAILURE'
    case 'unknown':                return 'UNKNOWN'
    default:                       return 'UNKNOWN'
  }
}

export function transformTracking(raw: DhlParcelDeTrackingResponse): TrackingEvent[] {
  const shipments = raw.shipments ?? []
  const result: TrackingEvent[] = []

  for (const shipment of shipments) {
    const events = shipment.events ?? []

    if (events.length === 0) {
      result.push({
        shipmentId: shipment.id,
        trackingNumber: shipment.id,
        carrierId: 'dhl-parcel-de',
        status: mapTrackingStatus(null, shipment.status ?? null),
        metadata: shipment as Record<string, unknown>,
      })
      continue
    }

    for (const evt of events) {
      const addr = evt.location?.address ?? null
      result.push({
        shipmentId: shipment.id,
        trackingNumber: shipment.id,
        carrierId: 'dhl-parcel-de',
        status: mapTrackingStatus(evt.statusCode, evt.status),
        description: evt.description || undefined,
        location: addr
          ? {
              city: addr.addressLocality ?? undefined,
              country: addr.countryCode ?? undefined,
              postalCode: addr.postalCode ?? undefined,
            }
          : undefined,
        occurredAt: toISODate(evt.timestamp),
        metadata: evt as Record<string, unknown>,
      })
    }
  }

  return result
}
