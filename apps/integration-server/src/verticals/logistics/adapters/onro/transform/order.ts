import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'
import type { OnroOrder } from './tracking'

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'PENDING'
  const s = status.toLowerCase()
  if (s.includes('pending') || s.includes('created') || s.includes('new')) return 'PENDING'
  if (s.includes('assigned') || s.includes('accepted')) return 'PROCESSING'
  if (
    s.includes('pickedup') ||
    s.includes('picked_up') ||
    s.includes('in_transit') ||
    s.includes('on_the_way') ||
    s.includes('out_for_delivery') ||
    s.includes('delivering') ||
    s.includes('near_customer')
  )
    return 'SHIPPED'
  if (s.includes('delivered') || s.includes('completed')) return 'DELIVERED'
  if (s.includes('cancelled') || s.includes('canceled') || s.includes('rejected')) return 'CANCELLED'
  return 'PENDING'
}

export function transformOrder(raw: OnroOrder): Order {
  return {
    id: String(raw.id),
    status: mapOrderStatus(raw.status),
    orderNumber: typeof raw.order_id === 'string' ? raw.order_id : undefined,
    originAddress: toAddress(raw.pickup_address as Record<string, unknown> | null),
    destinationAddress: toAddress(raw.dropoff_address as Record<string, unknown> | null),
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
