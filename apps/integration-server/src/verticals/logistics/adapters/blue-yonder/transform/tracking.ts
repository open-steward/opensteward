import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface BlueYonderTrackingLocation {
  streetAddress?: string
  city?: string
  stateOrProvince?: string
  postalCode?: string
  countryCode?: string
  [key: string]: unknown
}

export interface BlueYonderTrackingEvent {
  eventDateTime: string
  statusCode: string
  statusDescription: string
  location?: BlueYonderTrackingLocation
  [key: string]: unknown
}

export interface BlueYonderTrackingResponse {
  trackingNumber: string
  shipmentId?: string
  currentStatus?: string
  currentStatusDescription?: string
  events?: BlueYonderTrackingEvent[]
  [key: string]: unknown
}

function mapStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code.toUpperCase()] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: BlueYonderTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.stateOrProvince || loc.postalCode || loc.countryCode
  if (!hasAny) return undefined
  return {
    street1: loc.streetAddress ?? undefined,
    city: loc.city ?? undefined,
    state: loc.stateOrProvince ?? undefined,
    postalCode: loc.postalCode ?? undefined,
    country: loc.countryCode ?? undefined,
  }
}

export function transformTrackingEvents(raw: BlueYonderTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.trackingNumber

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'blue-yonder',
    status: mapStatus(evt.statusCode),
    description: evt.statusDescription ?? undefined,
    location: toLocation(evt.location),
    occurredAt: toISODate(evt.eventDateTime),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'blue-yonder',
      status: mapStatus(raw.currentStatus),
      description: raw.currentStatusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
