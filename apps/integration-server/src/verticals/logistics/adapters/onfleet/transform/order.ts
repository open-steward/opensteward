import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

// Onfleet order (taskOrder): a linked pickup + dropoff task pair.
// Endpoint: GET /api/v2/taskOrders/{shortId}
// Docs: https://docs.onfleet.com/reference/get-order

export interface OnfleetOrderTask {
  id?: string | null
  shortId?: string | null
  state?: number | null
  timeCreated?: number | null
  timeLastModified?: number | null
  [key: string]: unknown
}

export interface OnfleetOrder {
  id: string
  shortId?: string | null
  timeCreated?: number | null
  timeLastModified?: number | null
  source?: string | null
  events?: unknown[] | null
  pickupTask?: OnfleetOrderTask | null
  dropoffTask?: OnfleetOrderTask | null
  [key: string]: unknown
}

// Onfleet task state: 0=Unassigned, 1=Assigned, 2=Active, 3=Completed
function mapPickupDropoffState(
  pickupState: number | null | undefined,
  dropoffState: number | null | undefined,
): OrderStatus {
  const s = dropoffState ?? pickupState
  switch (s) {
    case 0: return 'PENDING'
    case 1: return 'PROCESSING'
    case 2: return 'AWAITING_SHIPMENT'
    case 3: return 'DELIVERED'
    default: return 'UNKNOWN'
  }
}

export function transformOrder(raw: OnfleetOrder): Order {
  const shipmentIds: string[] = []
  if (raw.pickupTask?.id) shipmentIds.push(raw.pickupTask.id)
  if (raw.dropoffTask?.id) shipmentIds.push(raw.dropoffTask.id)

  return {
    id: raw.id,
    orderNumber: raw.shortId ?? raw.id,
    status: mapPickupDropoffState(
      raw.pickupTask?.state ?? undefined,
      raw.dropoffTask?.state ?? undefined,
    ),
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    createdAt: toISODate(raw.timeCreated ?? undefined),
    updatedAt: toISODate(raw.timeLastModified ?? undefined),
    metadata: raw as Record<string, unknown>,
  }
}
