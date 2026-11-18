import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface Project44TrackingLocation {
  city?: string
  state?: string
  postalCode?: string
  country?: string
  [key: string]: unknown
}

export interface Project44TrackingStop {
  dateTime: string
  status: string
  description?: string
  location?: Project44TrackingLocation
  [key: string]: unknown
}

export interface Project44TrackingResult {
  shipmentId: string
  trackingNumber?: string
  carrierCode?: string
  status?: string
  statusDescription?: string
  stops?: Project44TrackingStop[]
  estimatedDeliveryDate?: string
  [key: string]: unknown
}

export interface Project44TrackingResponse {
  results: Project44TrackingResult[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: Project44TrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.postalCode || loc.country
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.postalCode ?? undefined,
    country: loc.country ?? undefined,
  }
}

export function transformTrackingEvents(raw: Project44TrackingResult): TrackingEvent[] {
  const trackingNumber = raw.trackingNumber ?? raw.shipmentId

  const events: TrackingEvent[] = (raw.stops ?? []).map((stop) => ({
    trackingNumber,
    carrierId: 'project44',
    status: mapTrackingStatus(stop.status),
    description: stop.description ?? undefined,
    location: toLocation(stop.location),
    occurredAt: toISODate(stop.dateTime),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'project44',
      status: mapTrackingStatus(raw.status),
      description: raw.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
