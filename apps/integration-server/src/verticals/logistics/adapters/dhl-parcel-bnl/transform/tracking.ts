import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface DhlParcelBnlTrackingEvent {
  timestamp: string
  status: string | null
  statusCode: string | null
  description: string | null
  location?: {
    city?: string | null
    countryCode?: string | null
    postalCode?: string | null
  } | null
  [key: string]: unknown
}

export interface DhlParcelBnlTrackingResponse {
  barcode: string
  status?: string | null
  events: DhlParcelBnlTrackingEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | null, status: string | null): TrackingEventStatus {
  const key = (code || status || '').toLowerCase()
  switch (key) {
    case 'pre-transit':
    case 'pretransit':
    case 'label_created':          return 'PRE_TRANSIT'
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

export function transformTracking(raw: DhlParcelBnlTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []

  if (events.length === 0) {
    return [{
      trackingNumber: raw.barcode,
      carrierId: 'dhl-parcel-bnl',
      status: mapTrackingStatus(null, raw.status ?? null),
      metadata: raw as Record<string, unknown>,
    }]
  }

  return events.map((evt) => ({
    trackingNumber: raw.barcode,
    carrierId: 'dhl-parcel-bnl',
    status: mapTrackingStatus(evt.statusCode, evt.status),
    description: evt.description || undefined,
    location: evt.location
      ? {
          city: evt.location.city ?? undefined,
          country: evt.location.countryCode ?? undefined,
          postalCode: evt.location.postalCode ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))
}
