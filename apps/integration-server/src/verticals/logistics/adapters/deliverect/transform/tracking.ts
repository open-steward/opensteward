import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toAddress, toISODate } from '../../shared/transform'

// Deliverect courier/delivery status event payload
export interface DeliverectCourierEvent {
  externalJobId?: string | null
  jobId?: string | null
  status?: string | null
  description?: string | null
  courier?: Record<string, unknown> | null
  trackingUrl?: string | null
  location?: Record<string, unknown> | null
  /** ETAs object: { pickupTime, deliveryTime } */
  ETAs?: Record<string, unknown> | null
  timestamp?: string | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TrackingEventStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created':
    case 'accepted':
    case 'pending':
      return 'PRE_TRANSIT'
    case 'picking_up':
    case 'at_pickup':
    case 'picked_up':
    case 'in_transit':
      return 'IN_TRANSIT'
    case 'delivering':
    case 'at_delivery':
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'returned':
    case 'return':
      return 'RETURN_TO_SENDER'
    case 'cancelled':
    case 'canceled':
    case 'failed':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

export function transformTrackingEvent(raw: DeliverectCourierEvent): TrackingEvent {
  const occurredAt =
    toISODate(raw.timestamp) ??
    toISODate(raw.updated) ??
    toISODate(raw.created)

  return {
    shipmentId: raw.externalJobId ?? raw.jobId ?? undefined,
    trackingNumber: raw.externalJobId ?? raw.jobId ?? undefined,
    carrierId: 'deliverect',
    status: mapStatus(raw.status),
    description: raw.description ?? undefined,
    location: toAddress(raw.location ?? null),
    occurredAt: occurredAt ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformTrackingEvents(raw: DeliverectCourierEvent): TrackingEvent[] {
  return [transformTrackingEvent(raw)]
}
