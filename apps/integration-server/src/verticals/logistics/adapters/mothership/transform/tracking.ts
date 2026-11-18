import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

/**
 * A single tracking event from Mothership's `GET /tracking/:shipmentId` endpoint.
 * The response is wrapped: `{ data: { results: MothershipTrackingEventRaw[] } }`.
 */
export interface MothershipTrackingEventRaw {
  /** ISO timestamp of the event. */
  timestamp?: string
  /** Status string describing how the shipment is progressing. */
  status?: string
  /** Category / type of the tracking event (e.g. "Pickup", "In Transit"). */
  eventType?: string
  /** City where the event occurred. */
  city?: string
  /** State where the event occurred. */
  state?: string
  /** Reference number that identifies the shipment. */
  shipmentReferenceNumber?: string
  /** Pro number, if available. */
  proNumber?: string
  /** Name of the delivery location. */
  deliveryLocationName?: string
  /** Name of the pickup location. */
  pickupLocationName?: string
  [key: string]: unknown
}

/**
 * Top-level response from `GET /tracking/:shipmentId`.
 */
export interface MothershipTrackingResponse {
  data?: {
    results?: MothershipTrackingEventRaw[]
    [key: string]: unknown
  }
  results?: MothershipTrackingEventRaw[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  const lower = code.toLowerCase().replace(/\s+/g, '_')
  return (TRACKING_STATUS_MAP[lower] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(evt: MothershipTrackingEventRaw): Address | undefined {
  if (!evt.city && !evt.state) return undefined
  return {
    city: evt.city ?? undefined,
    state: evt.state ?? undefined,
  }
}

export function transformTrackingEvents(
  raw: MothershipTrackingResponse,
  shipmentId: string,
): TrackingEvent[] {
  // Support both wrapped `data.results` and bare `results`
  const results = raw.data?.results ?? raw.results ?? []

  const events: TrackingEvent[] = results.map((evt) => ({
    shipmentId,
    trackingNumber: evt.shipmentReferenceNumber ?? evt.proNumber ?? undefined,
    carrierId: 'mothership',
    // `status` carries progress description; `eventType` carries event category
    status: mapTrackingStatus(evt.status ?? evt.eventType),
    description: evt.eventType ?? evt.status ?? undefined,
    location: toLocation(evt),
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      shipmentId,
      carrierId: 'mothership',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
