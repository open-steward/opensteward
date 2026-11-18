import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface AfterShipCheckpoint {
  checkpoint_time: string
  message: string | null
  tag: string
  subtag: string | null
  subtag_message: string | null
  city: string | null
  state: string | null
  zip: string | null
  country_iso3: string | null
  country_name: string | null
  location: string | null
  slug: string | null
  created_at: string | null
}

export interface AfterShipTracking {
  id: string
  tracking_number: string
  slug: string
  tag: string
  subtag: string | null
  subtag_message: string | null
  title: string | null
  active: boolean
  origin_country_iso3: string | null
  origin_city: string | null
  origin_state: string | null
  origin_postal_code: string | null
  destination_country_iso3: string | null
  destination_city: string | null
  destination_state: string | null
  destination_postal_code: string | null
  signed_by: string | null
  transit_time: number | null
  checkpoints: AfterShipCheckpoint[]
  created_at: string
  updated_at: string
  order_id: string | null
  order_number: string | null
  courier_tracking_link: string | null
  shipment_delivery_date: string | null
  shipment_pickup_date: string | null
  // 2024-10 fields read by transform/shipment.ts. Optional rather than `| null`
  // because pre-2024-10 fixtures (and the baselined flat test) do not carry them.
  shipment_type?: string | null
  return_to_sender?: boolean
  latest_estimated_delivery?: AfterShipEstimatedDelivery | null
  [key: string]: unknown
}

/**
 * `latest_estimated_delivery` on a 2024-10 tracking — the most recently
 * calculated EDD, whichever of the carrier, AfterShip AI or the account's custom
 * EDD settings produced it. `datetime` is the single value; `datetime_min` /
 * `datetime_max` bound a `range`-type EDD.
 */
export interface AfterShipEstimatedDelivery {
  type: 'range' | 'specific' | null
  source: string | null
  datetime: string | null
  datetime_min: string | null
  datetime_max: string | null
}

/**
 * GET /trackings envelope (Tracking API 2024-10). One page of trackings plus
 * a cursor: `next_cursor` is the opaque token for the following page and
 * `has_next_page` is false on the last one. Shared by `listTrackingEvents` and
 * `listShipments` — AfterShip has no separate shipment collection, a tracking
 * IS the shipment record, so both read the same page.
 */
export interface AfterShipTrackingListResponse {
  data: {
    trackings: AfterShipTracking[]
    pagination: { total: number; next_cursor: string | null; has_next_page: boolean }
  }
}

function mapTrackingStatus(tag: string): TrackingEventStatus {
  switch (tag) {
    case 'Pending':              return 'PRE_TRANSIT'
    case 'InfoReceived':         return 'PRE_TRANSIT'
    case 'InTransit':            return 'IN_TRANSIT'
    case 'OutForDelivery':       return 'OUT_FOR_DELIVERY'
    case 'AttemptFail':          return 'FAILURE'
    case 'Delivered':            return 'DELIVERED'
    case 'AvailableForPickup':   return 'AVAILABLE_FOR_PICKUP'
    case 'Exception':            return 'FAILURE'
    case 'Expired':              return 'FAILURE'
    default:                     return 'UNKNOWN'
  }
}

function toCheckpointLocation(cp: AfterShipCheckpoint): Address | undefined {
  const hasAny = cp.city || cp.state || cp.zip || cp.country_iso3 || cp.country_name
  if (!hasAny) return undefined
  return {
    city: cp.city ?? undefined,
    state: cp.state ?? undefined,
    postalCode: cp.zip ?? undefined,
    country: cp.country_iso3 ?? undefined,
  }
}

export function transformTracker(raw: AfterShipTracking): TrackingEvent[] {
  // One TrackingEvent per checkpoint, plus a top-level summary event if no checkpoints
  const events: TrackingEvent[] = (raw.checkpoints ?? []).map((cp) => ({
    trackingNumber: raw.tracking_number,
    carrierId: raw.slug ?? undefined,
    status: mapTrackingStatus(cp.tag),
    description: cp.subtag_message || cp.message || undefined,
    location: toCheckpointLocation(cp),
    occurredAt: toISODate(cp.checkpoint_time),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.tracking_number,
      carrierId: raw.slug ?? undefined,
      status: mapTrackingStatus(raw.tag),
      createdAt: toISODate(raw.created_at),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
