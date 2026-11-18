import type { TrackingEvent } from '../../../schema/trackingevent'

/**
 * Shippify tracking token response — returned by GET /v1/deliveries/token/{id}.
 *
 * This endpoint returns a public tracking URL rather than a list of tracking
 * events.  We synthesise a single TrackingEvent containing the tracking link.
 *
 * Field reference:
 *   https://docs.shippify.co/developers/en/shippify-api/deliveries/get-a-tracking-link.md
 */
export interface ShippifyTrackingResponse {
  token?: string | null
  url?: string | null
  recipient?: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformTrackingResponse(raw: ShippifyTrackingResponse): TrackingEvent[] {
  return [
    {
      trackingNumber: raw.token ?? undefined,
      status: 'UNKNOWN',
      description: raw.url ?? undefined,
      metadata: raw as Record<string, unknown>,
    },
  ]
}
