import type { TrackingEvent } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ─── SERA raw types ─────────────────────────────────────────────────────────
//
// GET /v1/tracking, 200 response schema, from
// https://developer.stamps.com/rest-api/reference/serav1.html:
//
//   tracking_number: string, carrier_name: string,
//   status_code: enum [accepted, delivered, exception, awaiting_shipment, in_transit],
//   carrier_status_description: string, estimated_delivery_date: string,
//   destination: { city, state_province, postal_code, country_code },
//   tracking_events: array of { occurred_at, event_description, city,
//     state_province, postal_code, country_code, signed_by, carrier_status_code }
//
// `status_code` is the shipment's CURRENT status, not a property of each event,
// and `carrier_status_code` is the carrier's own code with no documented
// values. Neither can honestly be mapped onto an individual event's status, so
// events carry none.

export interface EndiciaTrackingEvent {
  occurred_at?: string
  event_description?: string
  city?: string
  state_province?: string
  postal_code?: string
  country_code?: string
  signed_by?: string
  carrier_status_code?: string
  [key: string]: unknown
}

export interface EndiciaTrackingResponse {
  tracking_number?: string
  carrier_name?: string
  status_code?: string
  tracking_events?: EndiciaTrackingEvent[]
  [key: string]: unknown
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ALPHA2 = /^[A-Z]{2}$/

function mapLocation(evt: EndiciaTrackingEvent): Address | undefined {
  const location: Address = {}
  if (evt.city) location.city = evt.city
  if (evt.state_province) location.state = evt.state_province
  if (evt.postal_code) location.postalCode = evt.postal_code
  // SERA names the field country_code but does not state its format: keep it
  // only when it is already an ISO 3166 alpha-2 code.
  if (evt.country_code && ALPHA2.test(evt.country_code)) location.country = evt.country_code
  return Object.keys(location).length > 0 ? location : undefined
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * SERA's tracking_events as canonical events. `carrier` is the carrier the
 * caller asked SERA about, if any; SERA returns only a display `carrier_name`.
 * A response with no events is no events: nothing is synthesised from the
 * current status.
 */
export function transformTracking(
  raw: EndiciaTrackingResponse,
  trackingNumber: string,
  carrier?: string,
): TrackingEvent[] {
  const number = raw.tracking_number || trackingNumber
  return (raw.tracking_events ?? []).map((evt) => {
    const location = mapLocation(evt)
    const occurredAt = toISODate(evt.occurred_at)
    return {
      trackingNumber: number,
      ...(carrier ? { carrierId: carrier } : {}),
      ...(evt.event_description ? { description: evt.event_description } : {}),
      ...(location ? { location } : {}),
      ...(occurredAt ? { occurredAt } : {}),
      metadata: evt as Record<string, unknown>,
    }
  })
}
