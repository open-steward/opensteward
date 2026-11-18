import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface WakeoLocation {
  city?: string
  country?: string
  postalCode?: string
  portCode?: string
  airportCode?: string
  [key: string]: unknown
}

export interface WakeoTrackingEvent {
  id?: string
  status?: string
  description?: string
  location?: WakeoLocation
  occurredAt?: string
  transportMode?: string
  [key: string]: unknown
}

function mapTrackingStatus(status: string | undefined): TrackingEventStatus {
  switch (status) {
    case 'booked':            return 'PRE_TRANSIT'
    case 'departed':          return 'IN_TRANSIT'
    case 'in_transit':        return 'IN_TRANSIT'
    case 'arrived':           return 'IN_TRANSIT'
    case 'out_for_delivery':  return 'OUT_FOR_DELIVERY'
    case 'delivered':         return 'DELIVERED'
    case 'exception':         return 'FAILURE'
    case 'customs_hold':      return 'FAILURE'
    default:                  return 'UNKNOWN'
  }
}

function toEventLocation(loc: WakeoLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.country || loc.postalCode
  if (!hasAny) return undefined
  return {
    city: loc.city,
    country: loc.country,
    postalCode: loc.postalCode,
  }
}

export function transformTrackingEvent(raw: WakeoTrackingEvent, trackingNumber?: string): TrackingEvent {
  return {
    id: raw.id,
    trackingNumber,
    status: mapTrackingStatus(raw.status),
    description: raw.description,
    location: toEventLocation(raw.location),
    occurredAt: toISODate(raw.occurredAt),
    metadata: raw as Record<string, unknown>,
  }
}
