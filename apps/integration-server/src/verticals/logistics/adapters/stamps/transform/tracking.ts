import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * One entry of SERA's `tracking_events[]`. Location fields are flat on the
 * event itself (not nested under a `location`/`address` key), and the
 * per-event status rides on the carrier-specific `carrier_status_code`
 * rather than the top-level `status_code`.
 */
export interface SeraTrackingEvent {
  occurred_at: string | null
  event_description: string | null
  city: string | null
  state_province: string | null
  postal_code: string | null
  country_code: string | null
  signed_by: string | null
  carrier_status_code: string | null
  [key: string]: unknown
}

/**
 * `GET /v1/tracking` returns a single object (not an array of events): the
 * shipment-level summary plus a `tracking_events[]` history.
 */
export interface SeraTrackingResponse {
  tracking_number: string
  carrier_name: string | null
  status_code: 'accepted' | 'delivered' | 'exception' | 'awaiting_shipment' | 'in_transit' | string
  destination: Record<string, unknown> | null
  tracking_events: SeraTrackingEvent[] | null
  [key: string]: unknown
}

/**
 * Map SERA's documented top-level `status_code` enum to a canonical status.
 * Used as the fallback when an individual event has no `carrier_status_code`.
 */
function mapStatusCode(code: string): TrackingEventStatus {
  switch (code) {
    case 'delivered': return 'DELIVERED'
    case 'in_transit': return 'IN_TRANSIT'
    case 'awaiting_shipment': return 'PRE_TRANSIT'
    case 'accepted': return 'IN_TRANSIT'
    case 'exception': return 'FAILURE'
    default: return 'UNKNOWN'
  }
}

/**
 * Map a per-event `carrier_status_code` to a canonical status. These are
 * carrier-specific (SERA passes the underlying carrier's own code through),
 * so match on the common keyword patterns the way the other carrier-code
 * adapters in this vertical do rather than an exact enum.
 */
function mapCarrierStatusCode(code: string): TrackingEventStatus {
  const c = code.toLowerCase()

  if (c.includes('delivered')) return 'DELIVERED'
  if (c.includes('out_for_delivery') || c.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (c.includes('in_transit') || c.includes('in transit')) return 'IN_TRANSIT'
  if (c.includes('accepted') || c.includes('picked_up') || c.includes('picked up')) return 'IN_TRANSIT'
  if (c.includes('pre_transit') || c.includes('pre transit') || c.includes('label_created') || c.includes('label created')) return 'PRE_TRANSIT'
  if (c.includes('available_for_pickup') || c.includes('available for pickup')) return 'AVAILABLE_FOR_PICKUP'
  if (c.includes('return')) return 'RETURN_TO_SENDER'
  if (c.includes('failure') || c.includes('alert') || c.includes('exception')) return 'FAILURE'

  return 'UNKNOWN'
}

/**
 * Transform a SERA `GET /v1/tracking` response into canonical TrackingEvents.
 *
 * One TrackingEvent per `tracking_events[]` entry; if SERA returns no
 * history yet (e.g. `awaiting_shipment`), fall back to a single summary
 * event built from the top-level fields — the same shape the other
 * carrier-tracking adapters in this vertical use when the API returns a
 * status without a checkpoint history.
 */
export function transformTrackingEvents(
  raw: SeraTrackingResponse,
  trackingNumber: string,
): TrackingEvent[] {
  const number = raw.tracking_number ?? trackingNumber
  const carrierId = raw.carrier_name ?? undefined
  const events = raw.tracking_events ?? null

  if (!events || events.length === 0) {
    return [
      {
        trackingNumber: number,
        carrierId,
        status: mapStatusCode(raw.status_code),
        location: toAddress(raw.destination),
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    trackingNumber: number,
    carrierId,
    status: evt.carrier_status_code
      ? mapCarrierStatusCode(evt.carrier_status_code)
      : mapStatusCode(raw.status_code),
    description: evt.event_description ?? undefined,
    location: toAddress(evt as unknown as Record<string, unknown>),
    occurredAt: toISODate(evt.occurred_at),
    metadata: evt as Record<string, unknown>,
  }))
}
