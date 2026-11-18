import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

/**
 * Parcel2Go tracking result object.
 * Returned by GET /api/tracking/{orderLineId}
 */
export interface Parcel2GoTrackingResult {
  /** Carrier tracking number. */
  TrackingNumber?: string | null
  /** Carrier name. */
  CourierName?: string | null
  /** Public tracking URL. */
  TrackingUrl?: string | null
  Results?: Parcel2GoTrackingEvent[] | null
  [key: string]: unknown
}

export interface Parcel2GoTrackingEvent {
  Description?: string | null
  /** Status code string from the carrier. */
  StatusCode?: string | null
  /** Date/time of the event. */
  DateTime?: string | null
  Location?: string | null
  [key: string]: unknown
}

function mapStatus(code: string | null | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  const lower = code.toLowerCase()
  if (lower.includes('delivered')) return 'DELIVERED'
  if (lower.includes('out_for_delivery') || lower.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (lower.includes('pickup') || lower.includes('collection')) return 'AVAILABLE_FOR_PICKUP'
  if (lower.includes('return')) return 'RETURN_TO_SENDER'
  if (lower.includes('transit') || lower.includes('in_transit')) return 'IN_TRANSIT'
  if (lower.includes('pre_transit') || lower.includes('label') || lower.includes('booked')) return 'PRE_TRANSIT'
  if (lower.includes('fail') || lower.includes('exception') || lower.includes('undeliverable')) return 'FAILURE'
  return 'UNKNOWN'
}

export function transformTrackingResult(
  raw: Parcel2GoTrackingResult,
  orderLineId: string,
): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.Results ?? []).map((detail) => ({
    shipmentId: orderLineId,
    trackingNumber: raw.TrackingNumber ?? undefined,
    carrierId: raw.CourierName ?? undefined,
    status: mapStatus(detail.StatusCode),
    description: detail.Description ?? undefined,
    location: detail.Location
      ? { city: detail.Location }
      : undefined,
    occurredAt: toISODate(detail.DateTime),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      shipmentId: orderLineId,
      trackingNumber: raw.TrackingNumber ?? undefined,
      carrierId: raw.CourierName ?? undefined,
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
