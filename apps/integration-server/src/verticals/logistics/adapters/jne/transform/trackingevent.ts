/**
 * JNE individual tracking-event transform.
 *
 * Provides a per-event transform for canonical TrackingEvent records so that
 * the router can serve listTrackingEvents with individual event entries derived
 * from the JNE tracking response.
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface JneTrackingEventRaw {
  status?: string | null
  description?: string | null
  timestamp?: string | null
  location?: string | null
  city?: string | null
  country?: string | null
  postal_code?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s.includes('DELIVERED')) return 'DELIVERED'
  if (s.includes('OUT_FOR_DELIVERY') || s.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY'
  if (s.includes('PICKUP') || s.includes('AVAILABLE')) return 'AVAILABLE_FOR_PICKUP'
  if (s.includes('RETURN')) return 'RETURN_TO_SENDER'
  if (s.includes('FAIL') || s.includes('EXCEPTION') || s.includes('REFUSED')) return 'FAILURE'
  if (s.includes('TRANSIT') || s.includes('IN_TRANSIT')) return 'IN_TRANSIT'
  if (
    s.includes('CREATED') ||
    s.includes('MANIFEST') ||
    s.includes('PRE') ||
    s.includes('LABEL')
  )
    return 'PRE_TRANSIT'
  return 'UNKNOWN'
}

export function transformTrackingEvent(
  raw: JneTrackingEventRaw,
  trackingNumber?: string,
  shipmentId?: string,
): TrackingEvent {
  return {
    shipmentId: shipmentId || undefined,
    trackingNumber: trackingNumber || undefined,
    carrierId: 'jne',
    status: mapStatus(raw.status),
    description: raw.description || undefined,
    location:
      raw.city || raw.country || raw.postal_code || raw.location
        ? {
            city: raw.city ?? raw.location ?? undefined,
            country: raw.country ?? undefined,
            postalCode: raw.postal_code ?? undefined,
          }
        : undefined,
    occurredAt: toISODate(raw.timestamp),
    metadata: raw as Record<string, unknown>,
  }
}
