import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * DoorDash Drive does not have a dedicated /orders resource.
 * A delivery in DoorDash Drive IS an order — this transform maps the
 * GET /drive/v2/deliveries/{external_delivery_id} response to Order.
 */
export interface DoordashDriveDelivery {
  external_delivery_id: string
  delivery_status?: string | null
  pickup_address?: Record<string, unknown> | null
  dropoff_address?: Record<string, unknown> | null
  order_value?: number | null
  currency?: string | null
  dropoff_instructions?: string | null
  pickup_time?: string | null
  dropoff_time?: string | null
  actual_pickup_time?: string | null
  actual_dropoff_time?: string | null
  created_at?: string | null
  updated_at?: string | null
  cancelled_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): OrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'quote':
    case 'created':              return 'PENDING'
    case 'enroute_to_pickup':
    case 'arrived_at_pickup':   return 'PROCESSING'
    case 'picked_up':
    case 'enroute_to_dropoff':
    case 'arrived_at_dropoff':  return 'SHIPPED'
    case 'delivered':            return 'DELIVERED'
    case 'returned':             return 'RETURNED'
    case 'cancelled':
    case 'canceled':             return 'CANCELLED'
    default:                     return 'PENDING'
  }
}

export function transformOrder(raw: DoordashDriveDelivery): Order {
  return {
    id: raw.external_delivery_id,
    status: mapStatus(raw.delivery_status),
    orderNumber: raw.external_delivery_id,
    originAddress: toAddress(raw.pickup_address ?? null),
    destinationAddress: toAddress(raw.dropoff_address ?? null),
    currency: (raw.currency ?? undefined) as Order['currency'],
    // order_value is in cents
    totalAmount: raw.order_value != null ? raw.order_value / 100 : undefined,
    notes: (raw.dropoff_instructions ?? undefined) as string | undefined,
    requestedServiceCode: 'doordash_drive',
    orderAt: toISODate(raw.created_at),
    shippedAt: toISODate(raw.actual_pickup_time ?? raw.pickup_time),
    deliveredAt: toISODate(raw.actual_dropoff_time),
    cancelledAt: toISODate(raw.cancelled_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
