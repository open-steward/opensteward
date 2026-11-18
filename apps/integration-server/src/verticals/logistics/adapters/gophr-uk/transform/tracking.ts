import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toAddress, toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

/**
 * Raw event item within a Gophr UK job/delivery response.
 * Gophr returns an `events` array on the delivery payload when tracking history
 * is requested via GET /jobs/{job_id}/deliveries/{delivery_id}.
 */
export interface GophrUkTrackingEvent {
  timestamp?: string | null
  status?: string | null
  description?: string | null
  location?: Record<string, unknown> | null
  [key: string]: unknown
}

/**
 * Raw response from GET /jobs/{job_id} or GET /jobs/{job_id}/deliveries/{delivery_id}.
 * Gophr wraps events in the delivery object's `events` array.
 */
export interface GophrUkTrackingResponse {
  job_id?: string | null
  delivery_id?: string | null
  status?: string | null
  status_label?: string | null
  external_id?: string | null
  updated_time?: string | null
  created_time?: string | null
  events?: GophrUkTrackingEvent[]
  courier_location_lat?: number | null
  courier_location_lng?: number | null
  [key: string]: unknown
}

function mapTrackingStatus(raw: string | null | undefined): TrackingEventStatus {
  const key = (raw ?? '').toLowerCase()
  return (TRACKING_STATUS_MAP[key] as TrackingEventStatus) ?? 'UNKNOWN'
}

export function transformTrackingEvents(raw: GophrUkTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.job_id ?? raw.delivery_id ?? undefined
  const carrierId = 'gophr-uk'

  // If the response contains a historical events array, expand them.
  if (raw.events && raw.events.length > 0) {
    return raw.events.map((evt) => ({
      shipmentId: trackingNumber,
      trackingNumber,
      carrierId,
      status: mapTrackingStatus(evt.status),
      description: evt.description ?? undefined,
      location: toAddress(evt.location ?? null),
      occurredAt: toISODate(evt.timestamp),
      metadata: raw as Record<string, unknown>,
    }))
  }

  // Fall back to a single synthetic event from the top-level status.
  return [
    {
      shipmentId: trackingNumber,
      trackingNumber,
      carrierId,
      status: mapTrackingStatus(raw.status),
      description: raw.status_label ?? undefined,
      occurredAt: toISODate(raw.updated_time ?? raw.created_time),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
