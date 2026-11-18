import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface E2openTrackingLocation {
  name?: string
  city?: string
  stateProvince?: string
  postalCode?: string
  countryCode?: string
  [key: string]: unknown
}

export interface E2openTrackingEventRaw {
  eventType?: string
  eventCode?: string
  description?: string
  eventDateTime?: string
  location?: E2openTrackingLocation
  [key: string]: unknown
}

export interface E2openShipmentTrackingResponse {
  shipmentId?: string
  trackingNumber?: string
  currentStatus?: string
  currentStatusDescription?: string
  carrier?: string
  events?: E2openTrackingEventRaw[]
  [key: string]: unknown
}

function mapStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  const mapped = TRACKING_STATUS_MAP[code.toUpperCase()]
  return (mapped as TrackingEventStatus | undefined) ?? 'UNKNOWN'
}

function toLocation(loc: E2openTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.stateProvince || loc.postalCode || loc.countryCode
  if (!hasAny) return undefined
  return {
    name: loc.name ?? undefined,
    city: loc.city ?? undefined,
    state: loc.stateProvince ?? undefined,
    postalCode: loc.postalCode ?? undefined,
    country: loc.countryCode ?? undefined,
  }
}

export function transformTrackingEvents(
  raw: E2openShipmentTrackingResponse,
  carrierId = 'e2open',
): TrackingEvent[] {
  const trackingNumber = raw.trackingNumber ?? raw.shipmentId

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: raw.carrier ?? carrierId,
    status: mapStatus(evt.eventCode ?? evt.eventType),
    description: evt.description ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.eventDateTime),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: raw.carrier ?? carrierId,
      status: mapStatus(raw.currentStatus),
      description: raw.currentStatusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
