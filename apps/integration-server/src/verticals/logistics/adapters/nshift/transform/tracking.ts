import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── nShift raw types ────────────────────────────────────────────────────────

export interface NShiftTrackingLocation {
  city?: string | null
  country?: string | null
  postal_code?: string | null
  [key: string]: unknown
}

export interface NShiftTrackingEvent {
  eventCode?: string | null
  status?: string | null
  description?: string | null
  eventTime?: string | null
  timestamp?: string | null
  location?: NShiftTrackingLocation | null
  [key: string]: unknown
}

export interface NShiftTrackingResponse {
  shipmentId?: string | null
  parcelNo?: string | null
  trackingNumber?: string | null
  status?: string | null
  events?: NShiftTrackingEvent[] | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapTrackingStatus(code: string | null, status: string | null): TrackingEventStatus {
  const v = (code ?? status ?? '').toUpperCase()
  if (!v) return 'UNKNOWN'
  if (v.includes('PRE') || v === 'READY' || v === 'STORED' || v === 'BOOKED' || v === 'PRINTED') {
    return 'PRE_TRANSIT'
  }
  if (v === 'OUT_FOR_DELIVERY' || v.includes('OUT FOR DELIVERY') || v.includes('OUT_FOR_DELIVERY')) {
    return 'OUT_FOR_DELIVERY'
  }
  if (v === 'DELIVERED' || v === 'DELIVERED_OK' || v.includes('DELIVERED')) {
    return 'DELIVERED'
  }
  if (
    v === 'AVAILABLE_FOR_PICKUP' ||
    v.includes('PICKUP') ||
    v.includes('PICK_UP') ||
    v.includes('PICK UP') ||
    v.includes('PARCEL_SHOP')
  ) {
    return 'AVAILABLE_FOR_PICKUP'
  }
  if (v.includes('RETURN')) return 'RETURN_TO_SENDER'
  if (v.includes('FAIL') || v.includes('EXCEPTION') || v.includes('REFUSED') || v.includes('ERROR')) {
    return 'FAILURE'
  }
  if (
    v === 'DELIVERING' ||
    v.includes('TRANSIT') ||
    v.includes('EN_ROUTE') ||
    v.includes('IN_TRANSIT')
  ) {
    return 'IN_TRANSIT'
  }
  return 'UNKNOWN'
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformTracking(raw: NShiftTrackingResponse): TrackingEvent[] {
  const shipmentId = raw.shipmentId ?? undefined
  const trackingNumber = raw.trackingNumber ?? raw.parcelNo ?? undefined
  const events = raw.events ?? []

  if (events.length === 0) {
    return [
      {
        shipmentId,
        trackingNumber,
        carrierId: 'nshift',
        status: mapTrackingStatus(null, raw.status ?? null),
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId,
    trackingNumber,
    carrierId: 'nshift',
    status: mapTrackingStatus(evt.eventCode ?? null, evt.status ?? null),
    description: evt.description ?? undefined,
    location: evt.location
      ? {
          city: evt.location.city ?? undefined,
          country: evt.location.country ?? undefined,
          postalCode: evt.location.postal_code ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(evt.eventTime ?? evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))
}
