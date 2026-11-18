import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface LoadboardLocation {
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface LoadboardStatusEvent {
  status?: string | null
  description?: string | null
  timestamp?: string | null
  location?: LoadboardLocation | null
  [key: string]: unknown
}

export interface LoadboardLoad {
  loadId?: string | null
  referenceNumber?: string | null
  status?: string | null
  statusDescription?: string | null
  origin?: LoadboardLocation | null
  destination?: LoadboardLocation | null
  pickupDate?: string | null
  deliveryDate?: string | null
  statusHistory?: LoadboardStatusEvent[]
  [key: string]: unknown
}

function mapStatus(code: string | null | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code.toUpperCase()] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(
  loc: LoadboardLocation | null | undefined,
): { city?: string; state?: string; postalCode?: string; country?: string } | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.postalCode || loc.country
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.postalCode ?? undefined,
    country: loc.country ?? 'US',
  }
}

export function transformTrackingEvents(raw: LoadboardLoad): TrackingEvent[] {
  const trackingNumber = raw.loadId ?? raw.referenceNumber ?? undefined

  const history = raw.statusHistory ?? []

  if (history.length > 0) {
    return history.map((evt) => ({
      trackingNumber,
      carrierId: '123loadboard',
      status: mapStatus(evt.status),
      description: evt.description ?? undefined,
      location: toLocation(evt.location),
      occurredAt: toISODate(evt.timestamp),
      metadata: evt as Record<string, unknown>,
    }))
  }

  const events: TrackingEvent[] = []

  if (raw.pickupDate) {
    events.push({
      trackingNumber,
      carrierId: '123loadboard',
      status: 'PRE_TRANSIT',
      description: 'Load picked up',
      location: toLocation(raw.origin),
      occurredAt: toISODate(raw.pickupDate),
      metadata: raw as Record<string, unknown>,
    })
  }

  if (raw.deliveryDate) {
    events.push({
      trackingNumber,
      carrierId: '123loadboard',
      status: 'DELIVERED',
      description: 'Load delivered',
      location: toLocation(raw.destination),
      occurredAt: toISODate(raw.deliveryDate),
      metadata: raw as Record<string, unknown>,
    })
  }

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: '123loadboard',
      status: mapStatus(raw.status),
      description: raw.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
