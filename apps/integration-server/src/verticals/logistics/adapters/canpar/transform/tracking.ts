import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Canpar raw types ───────────────────────────────────────────────────────

export interface CanparTrackingEvent {
  code: string | null
  codeDescription: string | null
  local_date_time: string | null
  address?: {
    city: string | null
    province: string | null
    country: string | null
    postal_code: string | null
  } | null
  [key: string]: unknown
}

export interface CanparTrackingResponse {
  barcode: string
  status?: string | null
  events?: CanparTrackingEvent[] | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(code: string | null): TrackingEventStatus {
  switch (code) {
    case 'ORD':
    case 'PIC':
    case 'ORI':                 return 'PRE_TRANSIT'
    case 'IT':
    case 'TRN':
    case 'SCN':                 return 'IN_TRANSIT'
    case 'OFD':
    case 'OUT':                 return 'OUT_FOR_DELIVERY'
    case 'DLV':
    case 'DEL':
    case 'POD':                 return 'DELIVERED'
    case 'HFP':
    case 'HLD':                 return 'AVAILABLE_FOR_PICKUP'
    case 'RTS':
    case 'RTN':                 return 'RETURN_TO_SENDER'
    case 'EXC':
    case 'UND':                 return 'FAILURE'
    default:                    return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: CanparTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []
  const barcode = raw.barcode

  if (events.length === 0) {
    return [
      {
        trackingNumber: barcode ?? undefined,
        carrierId: 'canpar',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    trackingNumber: barcode ?? undefined,
    carrierId: 'canpar',
    status: mapTrackingStatus(evt.code),
    description: evt.codeDescription ?? undefined,
    location: evt.address
      ? {
          city: evt.address.city ?? undefined,
          state: evt.address.province ?? undefined,
          country: evt.address.country ?? undefined,
          postalCode: evt.address.postal_code ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(evt.local_date_time),
    metadata: evt as Record<string, unknown>,
  }))
}
