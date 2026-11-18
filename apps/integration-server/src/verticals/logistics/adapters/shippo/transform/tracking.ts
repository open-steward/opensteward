import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface ShippoTrackingLocation {
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
}

export interface ShippoTrackingStatus {
  object_id: string
  object_created: string
  object_updated: string
  status: string
  status_details: string
  status_date: string | null
  substatus: { code: string; text: string; action_required: boolean } | null
  location: ShippoTrackingLocation | null
}

export interface ShippoTrack {
  carrier: string
  tracking_number: string
  address_from: ShippoTrackingLocation | null
  address_to: ShippoTrackingLocation | null
  eta: string | null
  original_eta: string | null
  servicelevel: { name: string | null; token: string | null } | null
  tracking_status: ShippoTrackingStatus | null
  tracking_history: ShippoTrackingStatus[]
  transaction: string | null
  messages: string[]
  metadata: string | null
  test: boolean
  [key: string]: unknown
}

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'PRE_TRANSIT':  return 'PRE_TRANSIT'
    case 'TRANSIT':      return 'IN_TRANSIT'
    case 'DELIVERED':    return 'DELIVERED'
    case 'RETURNED':     return 'RETURN_TO_SENDER'
    case 'FAILURE':      return 'FAILURE'
    default:             return 'UNKNOWN'
  }
}

function toTrackingLocation(loc: ShippoTrackingLocation | null): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.country || loc.zip
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    country: loc.country ?? undefined,
    postalCode: loc.zip ?? undefined,
  }
}

export function transformTracker(raw: ShippoTrack): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.tracking_history ?? []).map((detail) => ({
    trackingNumber: raw.tracking_number,
    carrierId: raw.carrier ?? undefined,
    status: mapTrackingStatus(detail.status),
    description: detail.status_details || undefined,
    location: toTrackingLocation(detail.location),
    occurredAt: toISODate(detail.status_date),
    createdAt: toISODate(detail.object_created),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0 && raw.tracking_status) {
    events.push({
      trackingNumber: raw.tracking_number,
      carrierId: raw.carrier ?? undefined,
      status: mapTrackingStatus(raw.tracking_status.status),
      description: raw.tracking_status.status_details || undefined,
      location: toTrackingLocation(raw.tracking_status.location),
      occurredAt: toISODate(raw.tracking_status.status_date),
      createdAt: toISODate(raw.tracking_status.object_created),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
