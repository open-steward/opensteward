import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toAddress, toISODate } from '../../shared/transform'

// A single tracking checkpoint event as returned by the NetworkON API.
export interface NetworkONTrackingEvent {
  id?: string | number | null
  order_id?: string | number | null
  tracking_number?: string | null
  status?: string | null
  description?: string | null
  location?: Record<string, unknown> | null
  occurred_at?: string | null
  created_at?: string | null
  [key: string]: unknown
}

// NetworkON tracking statuses mapped to canonical TrackingEventStatus values.
function mapStatus(s: string | null | undefined): TrackingEventStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'pending':
    case 'created':
    case 'label_created':
    case 'ready':
      return 'PRE_TRANSIT'
    case 'dispatched':
    case 'in_transit':
    case 'in transit':
    case 'picked_up':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'out for delivery':
    case 'on_route':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'completed':
    case 'successful':
      return 'DELIVERED'
    case 'available_for_pickup':
      return 'AVAILABLE_FOR_PICKUP'
    case 'returned_to_sender':
    case 'return_to_sender':
      return 'RETURN_TO_SENDER'
    case 'failed':
    case 'exception':
    case 'cancelled':
    case 'canceled':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

export function transformTrackingEvent(raw: NetworkONTrackingEvent): TrackingEvent {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    shipmentId: raw.order_id != null ? String(raw.order_id) : undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'networkon',
    status: mapStatus(raw.status),
    description: raw.description ?? undefined,
    location: toAddress(raw.location ?? undefined),
    occurredAt: toISODate(raw.occurred_at ?? raw.created_at),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
