import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface EasyPostTrackingLocation {
  object: 'TrackingLocation'
  city: string | null
  state: string | null
  country: string | null
  zip: string | null
}

export interface EasyPostTrackingDetail {
  object: 'TrackingDetail'
  message: string
  description: string | null
  status: string
  /** In the TrackingDetail field table on docs.easypost.com/docs/trackers. Not read here. */
  status_detail?: string | null
  datetime: string
  source: string | null
  carrier_code: string | null
  tracking_location: EasyPostTrackingLocation | null
  /** In the TrackingDetail sample on docs.easypost.com/docs/trackers (null there). Not read here. */
  est_delivery_date?: string | null
}

export interface EasyPostTracker {
  id: string
  object: 'Tracker'
  mode: string
  tracking_code: string
  status: string
  status_detail: string | null
  created_at: string
  updated_at: string
  signed_by: string | null
  weight: number | null          // ounces
  est_delivery_date: string | null
  shipment_id: string | null
  carrier: string
  tracking_details: EasyPostTrackingDetail[]
  carrier_detail: Record<string, unknown> | null
  public_url: string | null
  [key: string]: unknown
}

function mapTrackerStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'pre_transit':          return 'PRE_TRANSIT'
    case 'in_transit':           return 'IN_TRANSIT'
    case 'out_for_delivery':     return 'OUT_FOR_DELIVERY'
    case 'delivered':            return 'DELIVERED'
    case 'available_for_pickup': return 'AVAILABLE_FOR_PICKUP'
    case 'return_to_sender':     return 'RETURN_TO_SENDER'
    case 'failure':
    case 'error':                return 'FAILURE'
    default:                     return 'UNKNOWN'
  }
}

function toTrackingLocation(loc: EasyPostTrackingLocation | null): Address | undefined {
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

/**
 * The id of a tracker's `index`th event. A TrackingDetail has no id of its
 * own (docs.easypost.com/docs/trackers), and the sync worker and the cache key
 * every row by `id`: without one, two pages of events look identical to the
 * worker's duplicate-page check, and the store refuses the rows outright.
 *
 * The position is stable because the array only grows at the end, by
 * arrival: "Oldest events appear first, and new events are appended as they
 * are received. Because carriers occasionally send updates out of order, use
 * the top-level status field for any primary workflow logic."
 * (docs.easypost.com/guides/tracking-guide). A late, out-of-order scan is
 * therefore appended, not inserted, and never shifts an earlier position, so
 * the details must not be sorted by `datetime` here. `datetime` would be a
 * weaker key: its zone is EasyPost's inference from the scan's location (the
 * same guide: "Stores and presents the timestamp with the correct time zone
 * whenever possible"), not a value the docs promise stays fixed.
 */
function eventId(raw: EasyPostTracker, index: number): string {
  return `${raw.id}-${index}`
}

export function transformTracker(raw: EasyPostTracker): TrackingEvent[] {
  // One TrackingEvent per tracking_detail, plus a top-level summary event if no details
  const events: TrackingEvent[] = (raw.tracking_details ?? []).map((detail, i) => ({
    id: eventId(raw, i),
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_code,
    carrierId: raw.carrier ?? undefined,
    status: mapTrackerStatus(detail.status),
    description: detail.message || detail.description || undefined,
    location: toTrackingLocation(detail.tracking_location),
    occurredAt: toISODate(detail.datetime),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    // The summary stands in for the first event and takes its id, so the
    // first real detail replaces it in the cache instead of sitting beside it.
    events.push({
      id: eventId(raw, 0),
      shipmentId: raw.shipment_id ?? undefined,
      trackingNumber: raw.tracking_code,
      carrierId: raw.carrier ?? undefined,
      status: mapTrackerStatus(raw.status),
      createdAt: toISODate(raw.created_at),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
