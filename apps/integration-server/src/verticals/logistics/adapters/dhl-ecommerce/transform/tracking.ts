import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── DHL eCommerce raw types ────────────────────────────────────────────────

export interface DhlEcommerceTrackingEvent {
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

export interface DhlEcommercePackage {
  trackingNumber: string
  shipmentId?: string | null
  status?: string | null
  events: DhlEcommerceTrackingEvent[]
  [key: string]: unknown
}

export interface DhlEcommerceTrackingResponse {
  packages: DhlEcommercePackage[]
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(code: string | null, status: string | null): TrackingEventStatus {
  const key = (code || status || '').toLowerCase()
  switch (key) {
    case 'pre-transit':
    case 'pretransit':
    case 'label_created':
    case 'preadvised':             return 'PRE_TRANSIT'
    case 'transit':
    case 'in_transit':
    case 'intransit':              return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'outfordelivery':
    case 'with_delivery_courier':  return 'OUT_FOR_DELIVERY'
    case 'delivered':              return 'DELIVERED'
    case 'available_for_pickup':
    case 'awaiting_collection':    return 'AVAILABLE_FOR_PICKUP'
    case 'return_to_sender':
    case 'returned':               return 'RETURN_TO_SENDER'
    case 'failure':
    case 'exception':              return 'FAILURE'
    case 'unknown':                return 'UNKNOWN'
    default:                       return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: DhlEcommerceTrackingResponse): TrackingEvent[] {
  const packages = raw.packages ?? []
  const result: TrackingEvent[] = []

  for (const pkg of packages) {
    const events = pkg.events ?? []

    if (events.length === 0) {
      result.push({
        shipmentId: pkg.shipmentId ?? undefined,
        trackingNumber: pkg.trackingNumber,
        carrierId: 'dhl-ecommerce',
        status: mapTrackingStatus(null, pkg.status ?? null),
        metadata: pkg as Record<string, unknown>,
      })
      continue
    }

    for (const evt of events) {
      const addr = evt.location?.address ?? null
      result.push({
        shipmentId: pkg.shipmentId ?? undefined,
        trackingNumber: pkg.trackingNumber,
        carrierId: 'dhl-ecommerce',
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
