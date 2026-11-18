import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── TNT raw types ──────────────────────────────────────────────────────────

export interface TntStatusEvent {
  statusCode: string
  statusDescription: string
  dateTime: string
  depot: string | null
  depotName: string | null
  signatory: string | null
  [key: string]: unknown
}

export interface TntTracking {
  consignmentNumber: string
  status: string
  statusDescription: string
  events: TntStatusEvent[]
  deliveryDate: string | null
  deliverySignatory: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(statusCode: string): TrackingEventStatus {
  switch (statusCode) {
    case 'CN':                      return 'PRE_TRANSIT'        // Collected
    case 'AR':                      return 'IN_TRANSIT'         // Arrived at depot
    case 'DP':                      return 'IN_TRANSIT'         // Departed depot
    case 'OD':                      return 'OUT_FOR_DELIVERY'
    case 'OK':                      return 'DELIVERED'
    case 'EX':                      return 'FAILURE'            // Exception
    case 'RT':                      return 'RETURN_TO_SENDER'   // Returned
    default:                        return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(
  raw: TntTracking,
  trackingNumber: string,
): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.consignmentNumber ?? trackingNumber,
    carrierId: 'tnt',
    status: mapTrackingStatus(evt.statusCode),
    description: evt.statusDescription || undefined,
    location: evt.depotName
      ? { city: evt.depotName }
      : undefined,
    occurredAt: toISODate(evt.dateTime),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'tnt',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
