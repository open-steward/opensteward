/**
 * APC Overnight individual tracking-event transform.
 *
 * Provides a per-event transform for canonical TrackingEvent records so that
 * the router can serve listTrackingEvents with individual event entries derived
 * from APC Overnight tracking responses.
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface ApcOvernightTrackingEvent {
  code?: string | null
  status?: string | null
  description?: string | null
  timestamp?: string | null
  location?: {
    city?: string | null
    country?: string | null
    postal_code?: string | null
  } | null
  [key: string]: unknown
}

function mapStatus(code: string | null, status: string | null): TrackingEventStatus {
  const v = (code ?? status ?? '').toUpperCase()
  if (!v) return 'UNKNOWN'
  if (
    v.includes('PRE') ||
    v === 'INFORMED' ||
    v === 'CREATED' ||
    v === 'LABEL_CREATED' ||
    v === 'MANIFESTED'
  )
    return 'PRE_TRANSIT'
  if (v === 'OUT_FOR_DELIVERY' || v.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY'
  if (v === 'DELIVERED' || v.includes('DELIVERED')) return 'DELIVERED'
  if (v === 'AVAILABLE_FOR_PICKUP' || v.includes('PICKUP') || v.includes('PICK UP'))
    return 'AVAILABLE_FOR_PICKUP'
  if (v.includes('RETURN')) return 'RETURN_TO_SENDER'
  if (
    v.includes('FAIL') ||
    v.includes('EXCEPTION') ||
    v.includes('REFUSED') ||
    v.includes('STOPPED')
  )
    return 'FAILURE'
  if (v.includes('TRANSIT') || v.includes('EN_ROUTE') || v.includes('IN_TRANSIT'))
    return 'IN_TRANSIT'
  return 'UNKNOWN'
}

export function transformTrackingEvent(
  raw: ApcOvernightTrackingEvent,
  trackingNumber?: string,
  shipmentId?: string,
): TrackingEvent {
  return {
    shipmentId: shipmentId || undefined,
    trackingNumber: trackingNumber || undefined,
    carrierId: 'apc-overnight',
    status: mapStatus(raw.code ?? null, raw.status ?? null),
    description: raw.description || undefined,
    location: raw.location
      ? {
          city: raw.location.city ?? undefined,
          country: raw.location.country ?? undefined,
          postalCode: raw.location.postal_code ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(raw.timestamp),
    metadata: raw as Record<string, unknown>,
  }
}
