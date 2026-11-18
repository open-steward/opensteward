import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate, nonempty } from '../../shared/transform'

export interface ShipperhqLineItem {
  sku: string
  quantity: number
  name?: string | null
  price?: number | null
  [key: string]: unknown
}

export interface ShipperhqOrder {
  id: string
  orderNumber?: string | null
  status?: string | null
  customerId?: string | null
  warehouseId?: string | null
  destination?: Record<string, unknown> | null
  origin?: Record<string, unknown> | null
  items?: ShipperhqLineItem[]
  shipmentIds?: string[]
  notes?: string | null
  serviceCode?: string | null
  orderedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
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

export function transformOrder(raw: ShipperhqOrder): Order {
  const shipmentIds = nonempty(raw.shipmentIds ?? [])

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
    orderNumber: raw.orderNumber ?? undefined,
    customerId: raw.customerId ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    originAddress: toAddress(raw.origin),
    destinationAddress: toAddress(raw.destination),
    shipmentIds,
    lineItems,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.serviceCode ?? undefined,
    orderAt: toISODate(raw.orderedAt),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
