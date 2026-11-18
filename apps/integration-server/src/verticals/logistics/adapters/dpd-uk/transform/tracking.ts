import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate, toAddress } from '../../shared/transform'

// ─── DPD-UK raw types ─────────────────────────────────────────────────────

export interface DpdUkTrackingEventRaw {
  date: string | null
  time: string | null
  statusCode: string | null
  statusDescription: string | null
  location: string | null
  depot: string | null
  [key: string]: unknown
}

export interface DpdUkConsignment {
  consignmentNumber: string | null
  parcelNumber: string | null
  events: DpdUkTrackingEventRaw[] | null
  [key: string]: unknown
}

export interface DpdUkTrackingResponse {
  consignment: DpdUkConsignment[] | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(statusCode: string | null): TrackingEventStatus {
  switch (statusCode) {
    case 'COLLECTED':          return 'PRE_TRANSIT'
    case 'IN_TRANSIT':         return 'IN_TRANSIT'
    case 'WITH_DRIVER':        return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':          return 'DELIVERED'
    case 'CARDED':             return 'FAILURE'
    case 'RETURNED':           return 'RETURN_TO_SENDER'
    case 'AT_PICKUP_SHOP':     return 'AVAILABLE_FOR_PICKUP'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(
  raw: DpdUkTrackingResponse,
  trackingNumber: string,
): TrackingEvent[] {
  const consignments = raw.consignment ?? []
  const events: TrackingEvent[] = []

  for (const consignment of consignments) {
    for (const evt of consignment.events ?? []) {
      const dateStr = evt.date && evt.time ? `${evt.date}T${evt.time}` : evt.date
      const event: TrackingEvent = {
        id: `${consignment.consignmentNumber ?? trackingNumber}-${events.length}`,
        trackingNumber: consignment.parcelNumber ?? trackingNumber,
        carrierId: 'dpd-uk',
        status: mapTrackingStatus(evt.statusCode),
        description: evt.statusDescription ?? undefined,
        location: evt.location ? toAddress({ city: evt.location }) : undefined,
        occurredAt: toISODate(dateStr),
        metadata: evt as Record<string, unknown>,
      }
      events.push(event)
    }
  }

  return events
}
