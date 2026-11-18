/**
 * Japan Post individual tracking-event transform.
 *
 * Provides a per-event transform for canonical TrackingEvent records so that
 * the router can serve listTrackingEvents with individual event entries derived
 * from Japan Post's parcel tracking response.
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface JapanPostTrackingEvent {
  status?: string | null
  detail?: string | null
  date?: string | null
  time?: string | null
  office?: string | null
  prefecture?: string | null
  country?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): TrackingEventStatus {
  switch (status ?? '') {
    case 'posting':
      return 'PRE_TRANSIT'
    case 'transit':
    case 'arrival':
      return 'IN_TRANSIT'
    case 'attempt':
      return 'FAILURE'
    case 'delivery':
      return 'DELIVERED'
    case 'return':
      return 'RETURN_TO_SENDER'
    default:
      return 'UNKNOWN'
  }
}

export function transformTrackingEvent(
  raw: JapanPostTrackingEvent,
  trackingNumber?: string,
): TrackingEvent {
  const dateTime =
    raw.time && raw.date ? `${raw.date}T${raw.time}` : (raw.date ?? undefined)
  return {
    trackingNumber: trackingNumber || undefined,
    carrierId: 'japan-post',
    status: mapStatus(raw.status),
    description: raw.detail || undefined,
    location:
      raw.office || raw.prefecture
        ? {
            city: raw.office ?? undefined,
            state: raw.prefecture ?? undefined,
            country: raw.country ?? undefined,
          }
        : undefined,
    occurredAt: toISODate(dateTime),
    metadata: raw as Record<string, unknown>,
  }
}
