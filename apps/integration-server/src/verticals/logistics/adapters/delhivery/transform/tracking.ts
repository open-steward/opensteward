import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Delhivery raw types ───────────────────────────────────────────────────

export interface DelhiveryTrackingScan {
  status: string
  status_description: string | null
  scan_date_time: string
  city: string | null
  center: string | null
  [key: string]: unknown
}

export interface DelhiveryTrackingResponse {
  waybill: string
  status: string | null
  scans: DelhiveryTrackingScan[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'Manifested':        return 'PRE_TRANSIT'
    case 'In Transit':        return 'IN_TRANSIT'
    case 'Dispatched':        return 'IN_TRANSIT'
    case 'Out for delivery':  return 'OUT_FOR_DELIVERY'
    case 'Delivered':         return 'DELIVERED'
    case 'Undelivered':       return 'FAILURE'
    case 'RTO':               return 'RETURN_TO_SENDER'
    default:                  return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: DelhiveryTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.scans ?? []).map((scan) => ({
    trackingNumber: raw.waybill ?? undefined,
    carrierId: 'delhivery',
    status: mapTrackingStatus(scan.status),
    description: scan.status_description || undefined,
    location: scan.city
      ? { city: scan.city }
      : undefined,
    occurredAt: toISODate(scan.scan_date_time),
    metadata: scan as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.waybill ?? undefined,
      carrierId: 'delhivery',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
