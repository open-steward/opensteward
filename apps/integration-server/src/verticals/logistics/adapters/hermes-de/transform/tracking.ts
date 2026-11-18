import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Hermes Germany raw types ─────────────────────────────────────────────────────

export interface HermesDeTrackingEvent {
  code: string | null
  status: string | null
  description: string | null
  timestamp: string | null
  location: {
    city: string | null
    country: string | null
    postal_code: string | null
  } | null
  [key: string]: unknown
}

export interface HermesDeTrackingResponse {
  shipment_id?: string
  tracking_number?: string
  status?: string | null
  events?: HermesDeTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(code: string | null, status: string | null): TrackingEventStatus {
  const v = (code ?? status ?? '').toUpperCase()
  if (!v) return 'UNKNOWN'
  if (v.includes('PRE') || v === 'INFORMED' || v === 'CREATED' || v === 'LABEL_CREATED' || v === 'MANIFESTED') return 'PRE_TRANSIT'
  if (v === 'OUT_FOR_DELIVERY' || v.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY'
  if (v === 'DELIVERED' || v.includes('DELIVERED')) return 'DELIVERED'
  if (v === 'AVAILABLE_FOR_PICKUP' || v.includes('PICKUP') || v.includes('PICK UP')) return 'AVAILABLE_FOR_PICKUP'
  if (v.includes('RETURN')) return 'RETURN_TO_SENDER'
  if (v.includes('FAIL') || v.includes('EXCEPTION') || v.includes('REFUSED') || v.includes('STOPPED')) return 'FAILURE'
  if (v.includes('TRANSIT') || v.includes('EN_ROUTE') || v.includes('IN_TRANSIT')) return 'IN_TRANSIT'
  return 'UNKNOWN'
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: HermesDeTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []

  if (events.length === 0) {
    return [
      {
        shipmentId: raw.shipment_id ?? undefined,
        trackingNumber: raw.tracking_number ?? undefined,
        carrierId: 'hermes-de',
        status: mapTrackingStatus(null, raw.status ?? null),
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'hermes-de',
    status: mapTrackingStatus(evt.code, evt.status),
    description: evt.description ?? undefined,
    location: evt.location
      ? {
          city: evt.location.city ?? undefined,
          country: evt.location.country ?? undefined,
          postalCode: evt.location.postal_code ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))
}
