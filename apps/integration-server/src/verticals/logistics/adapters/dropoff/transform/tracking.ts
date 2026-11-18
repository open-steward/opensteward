import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface DropoffOrder {
  order_id: string
  order_status_code?: string | null
  order_status?: string | null
  tracking_number?: string | null
  pickup_name?: string | null
  dropoff_name?: string | null
  company_name?: string | null
  updated?: string | null
  created?: string | null
  [key: string]: unknown
}

export interface DropoffOrderListResponse {
  success: boolean
  total?: number
  count?: number
  data?: DropoffOrder[]
  [key: string]: unknown
}

function mapStatus(code: string | null | undefined): TrackingEventStatus {
  switch ((code ?? '').toLowerCase()) {
    case 'pending':
    case 'queued':
    case 'scheduled':
      return 'PRE_TRANSIT'
    case 'assigned':
    case 'driver_assigned':
    case 'picking_up':
    case 'picked_up':
    case 'in_transit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'arriving':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'complete':
    case 'completed':
      return 'DELIVERED'
    case 'returned':
    case 'return':
      return 'RETURN_TO_SENDER'
    case 'cancelled':
    case 'canceled':
    case 'failed':
    case 'rejected':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(raw: DropoffOrder): TrackingEvent[] {
  const statusCode = raw.order_status_code ?? raw.order_status
  return [
    {
      shipmentId: raw.order_id,
      trackingNumber: raw.tracking_number ?? raw.order_id,
      carrierId: 'dropoff',
      status: mapStatus(statusCode),
      description: raw.order_status ?? undefined,
      occurredAt: toISODate(raw.updated ?? raw.created),
      metadata: raw as Record<string, unknown>,
    },
  ]
}

export function transformTrackingList(raw: DropoffOrder[]): TrackingEvent[] {
  return raw.flatMap((order) => transformTracking(order))
}
