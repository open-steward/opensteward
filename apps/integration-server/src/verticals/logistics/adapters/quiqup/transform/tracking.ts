import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface QuiqupTrackingLocation {
  city?: string | null
  country_code?: string | null
  postcode?: string | null
  [key: string]: unknown
}

export interface QuiqupTrackingEvent {
  id?: string | null
  status?: string | null
  description?: string | null
  occurred_at?: string | null
  location?: QuiqupTrackingLocation | null
  [key: string]: unknown
}

/**
 * Quiqup tracking response — a list of events for a given tracking number
 * or job id.
 */
export interface QuiqupTrackingResponse {
  job_id?: string | null
  tracking_number?: string | null
  status?: string | null
  events?: QuiqupTrackingEvent[] | null
  created_at?: string | null
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch (status) {
    case 'pending':
    case 'created':
    case 'accepted':
    case 'assigned':
      return 'PRE_TRANSIT'
    case 'collected':
    case 'in_transit':
    case 'at_hub':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'with_courier':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'completed':
      return 'DELIVERED'
    case 'available_for_pickup':
      return 'AVAILABLE_FOR_PICKUP'
    case 'returned':
    case 'return_to_sender':
      return 'RETURN_TO_SENDER'
    case 'failed':
    case 'delivery_failed':
    case 'exception':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

function toTrackingLocation(
  loc: QuiqupTrackingLocation | null | undefined,
): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.country_code || loc.postcode
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    country: loc.country_code ?? undefined,
    postalCode: loc.postcode ?? undefined,
  }
}

export function transformTracking(raw: QuiqupTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    id: evt.id ?? undefined,
    shipmentId: raw.job_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'quiqup',
    status: mapTrackingStatus(evt.status),
    description: evt.description ?? undefined,
    location: toTrackingLocation(evt.location),
    occurredAt: toISODate(evt.occurred_at),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }))

  // If the API returned no detail events, synthesise one from the top-level status
  if (events.length === 0) {
    events.push({
      shipmentId: raw.job_id ?? undefined,
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: 'quiqup',
      status: mapTrackingStatus(raw.status),
      createdAt: toISODate(raw.created_at),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
