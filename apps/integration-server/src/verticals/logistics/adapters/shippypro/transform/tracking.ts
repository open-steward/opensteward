import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'

/**
 * ShippyPro `GetTracking` response.
 *
 * https://api.shippypro.com/docs/v1.json, `GetTrackingResponse`:
 *   "Carrier": {"type":"string","example":"UPS"},
 *   "StatusCode": {"type":"number","description":"ShippyPro tracking status code:
 *     `1` Info Received, `2` In Transit, `3` Out for Delivery, `4` Missed Delivery,
 *     `5` Exception, `6` Delivered."},
 *   "Details": {"type":"array","description":"Tracking status events, ordered by date, most recent first.",
 *     "items":{"properties":{"date":{"type":"string","description":"Unix timestamp (seconds), as a string."},
 *       "message":{"type":"string","example":"DELIVERED"},"city":{"type":"string","example":"MOTRIL"},
 *       "StatusCode":{"type":"number","example":6}}}}
 */
export interface ShippyProTrackingDetail {
  date?: string | null
  message?: string | null
  city?: string | null
  StatusCode?: number | null
  [key: string]: unknown
}

export interface ShippyProTracking {
  Carrier?: string | null
  StatusCode?: number | null
  Details?: ShippyProTrackingDetail[] | null
  [key: string]: unknown
}

/**
 * The documented ShippyPro tracking code values (https://api.shippypro.com/docs/v1.json,
 * "Tracking Code Values"): "``0`` | Order In Preparation" through "``6`` | Delivered".
 */
export function mapTrackingStatusCode(code: number | null | undefined): TrackingEventStatus {
  switch (code) {
    case 0: // Order In Preparation
    case 1: // Info Received
      return 'PRE_TRANSIT'
    case 2: // In Transit
      return 'IN_TRANSIT'
    case 3: // Out for Delivery
      return 'OUT_FOR_DELIVERY'
    case 4: // Missed Delivery
    case 5: // Exception
      return 'FAILURE'
    case 6: // Delivered
      return 'DELIVERED'
    default:
      return 'UNKNOWN'
  }
}

/** A documented "Unix timestamp (seconds), as a string" as a Date. */
export function fromUnixSeconds(value: string | number | null | undefined): Date | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined
  const seconds = Number(value)
  if (!Number.isFinite(seconds)) return undefined
  return new Date(seconds * 1000)
}

/**
 * One event per documented `Details` entry. The tracking number is the one the
 * caller asked about (`GetTracking` takes it as `Code` and does not echo it).
 * A response with no `Details` has no event history, and returns none: the
 * top-level `StatusCode` is a current status, not an event.
 */
export function transformTracking(raw: ShippyProTracking, trackingNumber: string): TrackingEvent[] {
  return (raw.Details ?? []).map((detail) => ({
    trackingNumber,
    status: mapTrackingStatusCode(detail.StatusCode),
    description: detail.message ?? undefined,
    location: detail.city ? { city: detail.city } : undefined,
    occurredAt: fromUnixSeconds(detail.date),
    metadata: { Carrier: raw.Carrier, ...detail },
  }))
}
