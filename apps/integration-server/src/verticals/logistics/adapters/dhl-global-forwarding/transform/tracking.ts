import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── DHL Unified Tracking raw types ─────────────────────────────────────────

export interface DhlGfTrackingEvent {
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

export interface DhlGfShipmentBlock {
  id: string
  status?: {
    statusCode?: string | null
    status?: string | null
    description?: string | null
  } | null
  events: DhlGfTrackingEvent[]
  [key: string]: unknown
}

export interface DhlGfTrackingResponse {
  shipments: DhlGfShipmentBlock[]
}

function mapTrackingStatus(code: string | null, status: string | null): TrackingEventStatus {
  const key = (code || status || '').toLowerCase()
  switch (key) {
    case 'pre-transit':
    case 'pretransit':             return 'PRE_TRANSIT'
    case 'transit':
    case 'in_transit':             return 'IN_TRANSIT'
    case 'out_for_delivery':       return 'OUT_FOR_DELIVERY'
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

export function transformTracking(raw: DhlGfTrackingResponse): TrackingEvent[] {
  const shipments = raw.shipments ?? []
  const result: TrackingEvent[] = []

  for (const shipment of shipments) {
    const events = shipment.events ?? []

    if (events.length === 0) {
      result.push({
        shipmentId: shipment.id,
        trackingNumber: shipment.id,
        carrierId: 'dhl-global-forwarding',
        status: mapTrackingStatus(shipment.status?.statusCode ?? null, shipment.status?.status ?? null),
        metadata: shipment as Record<string, unknown>,
      })
      continue
    }

    for (const evt of events) {
      const addr = evt.location?.address ?? null
      result.push({
        shipmentId: shipment.id,
        trackingNumber: shipment.id,
        carrierId: 'dhl-global-forwarding',
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
