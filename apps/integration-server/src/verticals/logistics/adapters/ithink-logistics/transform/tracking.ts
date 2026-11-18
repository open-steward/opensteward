import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'

/**
 * `POST https://api.ithinklogistics.com/api_v3/order/track.json`
 * (https://docs.ithinklogistics.com/doc-track-order/3). The response is
 * `{"status_code": 200, "data": {"<awb>": IthinkLogisticsTrackingRaw}}`, and
 * the history is the AWB's `scan_details` array.
 *
 * `scan_date_time` ("2017-06-07 14:05:57") has no documented time zone, so it
 * is not turned into `occurredAt`; it stays on the event's `metadata`.
 */
export interface IthinkLogisticsScanRaw {
  status?: string | null
  status_code?: string | null
  scan_location?: string | null
  remark?: string | null
  scan_date_time?: string | null
  status_reason?: string | null
  [key: string]: unknown
}

export interface IthinkLogisticsTrackingRaw {
  message?: string | null
  awb_no?: string | null
  logistic?: string | null
  current_status?: string | null
  current_status_code?: string | null
  scan_details?: IthinkLogisticsScanRaw[] | null
  [key: string]: unknown
}

/**
 * The documented "Status - Status Code" table
 * (https://docs.ithinklogistics.com/doc-track-order/3), compared
 * case-insensitively. Cancellations have no canonical tracking status and,
 * like anything undocumented, are UNKNOWN.
 */
const EVENT_STATUS: Record<string, TrackingEventStatus> = {
  manifested: 'PRE_TRANSIT',
  'not picked': 'PRE_TRANSIT',
  'rev manifest': 'PRE_TRANSIT',
  'rev out for pick up': 'PRE_TRANSIT',
  'picked up': 'IN_TRANSIT',
  'in transit': 'IN_TRANSIT',
  'reached at destination': 'IN_TRANSIT',
  delayed: 'IN_TRANSIT',
  misrouted: 'IN_TRANSIT',
  'rev picked up': 'IN_TRANSIT',
  'rev in transit': 'IN_TRANSIT',
  'out for delivery': 'OUT_FOR_DELIVERY',
  'rev out for delivery': 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  'rev delivered': 'DELIVERED',
  undelivered: 'FAILURE',
  'out of delivery area': 'FAILURE',
  damaged: 'FAILURE',
  lost: 'FAILURE',
  shortage: 'FAILURE',
  'rto shortage': 'FAILURE',
  'rto pending': 'RETURN_TO_SENDER',
  'rto processing': 'RETURN_TO_SENDER',
  'rto in transit': 'RETURN_TO_SENDER',
  'reached at origin': 'RETURN_TO_SENDER',
  'rto out for delivery': 'RETURN_TO_SENDER',
  'rto undelivered': 'RETURN_TO_SENDER',
  'rto delivered': 'RETURN_TO_SENDER',
}

export function mapScanStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  return EVENT_STATUS[status.trim().toLowerCase()] ?? 'UNKNOWN'
}

function text(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}

/**
 * One event per `scan_details` entry, in the documented order. The id is the
 * AWB and the entry's position in that array, both documented.
 */
export function transformTracking(raw: IthinkLogisticsTrackingRaw, awb: string): TrackingEvent[] {
  return (raw.scan_details ?? []).map((scan, i) => ({
    id: `${awb}:${i}`,
    trackingNumber: awb,
    carrierId: 'ithink-logistics',
    status: mapScanStatus(scan.status),
    description: text(scan.remark),
    metadata: scan as Record<string, unknown>,
  }))
}
