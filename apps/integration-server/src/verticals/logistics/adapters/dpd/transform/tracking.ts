import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate, toAddress } from '../../shared/transform'

export interface DPDTrackingEventRaw {
  date: string | null
  time: string | null
  statusCode: string | null
  statusDescription: string | null
  location: string | null
  depot: string | null
  [key: string]: unknown
}

export interface DPDConsignment {
  consignmentNumber: string | null
  parcelNumber: string | null
  events: DPDTrackingEventRaw[] | null
  [key: string]: unknown
}

export interface DPDTrackingResponse {
  consignment: DPDConsignment[] | null
  [key: string]: unknown
}

function mapTrackingStatus(statusCode: string | null): TrackingEventStatus {
  switch (statusCode) {
    case 'COLLECTED':          return 'PRE_TRANSIT'
    case 'IN_TRANSIT':         return 'IN_TRANSIT'
    case 'AT_DEPOT':           return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':   return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':          return 'DELIVERED'
    case 'ATTEMPTED_DELIVERY': return 'FAILURE'
    case 'RETURNED':           return 'RETURN_TO_SENDER'
    default:                   return 'UNKNOWN'
  }
}

export function transformTracking(
  raw: DPDTrackingResponse,
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
        carrierId: 'dpd',
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
