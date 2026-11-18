import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * A single checkpoint from `POST /v2/trackings`.
 */
export interface EshipzCheckpoint {
  city?: string | null
  remark?: string | null
  tag?: string | null
  date?: string | null
  [key: string]: unknown
}

/**
 * A single tracking record returned from `POST /v2/trackings`.
 * The API returns a list; we consume `[0]`.
 */
export interface EshipzTrackingRecord {
  awb?: string | null
  slug?: string | null
  tag?: string | null
  shipment_status?: string | null
  delivery_date?: string | null
  expected_delivery_date?: string | null
  checkpoints?: EshipzCheckpoint[] | null
  [key: string]: unknown
}

function mapTag(tag: string | null | undefined): TrackingEventStatus {
  if (!tag) return 'UNKNOWN'
  switch (tag.toLowerCase()) {
    case 'infotransit':
    case 'intransit':
      return 'IN_TRANSIT'
    case 'outfordelivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'availableforpickup':
      return 'AVAILABLE_FOR_PICKUP'
    case 'returntosender':
    case 'rto':
      return 'RETURN_TO_SENDER'
    case 'exception':
    case 'failed':
    case 'ndr':
      return 'FAILURE'
    case 'pretransit':
    case 'booked':
      return 'PRE_TRANSIT'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(
  records: EshipzTrackingRecord[],
  trackId: string,
): TrackingEvent[] {
  const record = records[0]
  if (!record) return []

  const checkpoints = record.checkpoints ?? []

  return checkpoints.map((cp, idx) => ({
    id: `${trackId}-${idx}`,
    shipmentId: trackId,
    trackingNumber: record.awb ?? trackId ?? undefined,
    carrierId: record.slug ?? undefined,
    status: mapTag(cp.tag),
    description: cp.remark ?? undefined,
    location: cp.city ? toAddress({ city: cp.city }) : undefined,
    occurredAt: toISODate(cp.date),
    metadata: cp as Record<string, unknown>,
  }))
}
