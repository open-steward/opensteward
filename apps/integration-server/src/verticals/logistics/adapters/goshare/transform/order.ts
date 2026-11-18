import type { Order, OrderStatus } from '../../../schema/order'
import type { GoshareDelivery } from './tracking'
import { toAddress, toISODate } from '../../shared/transform'

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'created':
    case 'searching_driver':   return 'PENDING'
    case 'driver_assigned':
    case 'driver_accepted':
    case 'driver_en_route':
    case 'picked_up':          return 'PROCESSING'
    case 'in_transit':
    case 'out_for_delivery':
    case 'arriving_soon':      return 'SHIPPED'
    case 'delivered':
    case 'completed':          return 'DELIVERED'
    case 'returned':
    case 'return_to_sender':   return 'RETURNED'
    case 'cancelled':
    case 'canceled':           return 'CANCELLED'
    default:                   return 'UNKNOWN'
  }
}

export function deliveryToOrder(raw: GoshareDelivery): Order {
  return {
    id: raw.id,
    status: mapOrderStatus(raw.status),
    originAddress: toAddress(raw.pickup_address ?? null),
    destinationAddress: toAddress(raw.delivery_address ?? null),
    orderAt: toISODate(raw.created_at),
    deliveredAt: toISODate(raw.delivered_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
