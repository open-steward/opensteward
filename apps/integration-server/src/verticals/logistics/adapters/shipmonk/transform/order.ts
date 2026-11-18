import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate, nonempty } from '../../shared/transform'

export interface ShipmonkLineItem {
  sku: string
  quantity: number
  name?: string | null
  price?: number | null
  [key: string]: unknown
}

export interface ShipmonkOrder {
  id: string
  order_number?: string | null
  status?: string | null
  customer_id?: string | null
  warehouse_id?: string | null
  ship_to?: Record<string, unknown> | null
  ship_from?: Record<string, unknown> | null
  items?: ShipmonkLineItem[]
  shipment_ids?: string[]
  notes?: string | null
  service_code?: string | null
  ordered_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch (status) {
    case 'pending':            return 'PENDING'
    case 'processing':         return 'PROCESSING'
    case 'on_hold':            return 'ON_HOLD'
    case 'awaiting_shipment':  return 'AWAITING_SHIPMENT'
    case 'shipped':            return 'SHIPPED'
    case 'delivered':          return 'DELIVERED'
    case 'cancelled':          return 'CANCELLED'
    case 'returned':           return 'RETURNED'
    default:                   return 'PENDING'
  }
}

export function transformOrder(raw: ShipmonkOrder): Order {
  const shipmentIds = nonempty(raw.shipment_ids ?? [])

  const lineItems = nonempty(
    (raw.items ?? []).map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
      description: item.name ?? undefined,
      unitAmount: item.price ?? undefined,
    })),
  )

  return {
    id: raw.id,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.order_number ?? undefined,
    customerId: raw.customer_id ?? undefined,
    warehouseId: raw.warehouse_id ?? undefined,
    originAddress: toAddress(raw.ship_from),
    destinationAddress: toAddress(raw.ship_to),
    shipmentIds,
    lineItems,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.service_code ?? undefined,
    orderAt: toISODate(raw.ordered_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
