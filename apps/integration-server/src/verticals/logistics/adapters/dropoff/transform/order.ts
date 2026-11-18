import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress } from '../../shared/transform'
import type { DropoffOrder } from './tracking'

function mapOrderStatus(code: string | null | undefined): OrderStatus | undefined {
  switch ((code ?? '').toLowerCase()) {
    case 'pending':
    case 'queued':
      return 'PENDING'
    case 'scheduled':
    case 'assigned':
    case 'driver_assigned':
      return 'PROCESSING'
    case 'picking_up':
    case 'picked_up':
    case 'in_transit':
    case 'out_for_delivery':
    case 'arriving':
      return 'SHIPPED'
    case 'delivered':
    case 'complete':
    case 'completed':
      return 'DELIVERED'
    case 'returned':
    case 'return':
      return 'RETURNED'
    case 'cancelled':
    case 'canceled':
    case 'failed':
    case 'rejected':
      return 'CANCELLED'
    default:
      return undefined
  }
}

export function transformOrder(raw: DropoffOrder): Order {
  const statusCode = raw.order_status_code ?? raw.order_status
  const originRaw = raw.pickup_address as Record<string, unknown> | undefined
  const destRaw = raw.dropoff_address as Record<string, unknown> | undefined

  return {
    id: raw.order_id,
    status: mapOrderStatus(statusCode),
    orderNumber: String(raw.order_id),
    originAddress: originRaw ? toAddress(originRaw) : undefined,
    destinationAddress: destRaw ? toAddress(destRaw) : undefined,
    notes: raw.delivery_instructions as string | undefined,
    createdAt: toISODate(raw.created),
    updatedAt: toISODate(raw.updated),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformOrderList(raws: DropoffOrder[]): Order[] {
  return raws.map(transformOrder)
}
