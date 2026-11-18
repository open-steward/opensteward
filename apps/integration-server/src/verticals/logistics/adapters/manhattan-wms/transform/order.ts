import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'
import { ORDER_STATUS_MAP } from '../constants'

export interface ManhattanWmsOrderResponse {
  orderId: string
  orderNumber?: string
  customerId?: string
  warehouseId?: string
  status?: string
  shipmentIds?: string[]
  currency?: string
  totalAmount?: number
  notes?: string
  requestedServiceCode?: string
  orderAt?: string
  shippedAt?: string
  deliveredAt?: string
  cancelledAt?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface ManhattanWmsOrdersResponse {
  orders: ManhattanWmsOrderResponse[]
  [key: string]: unknown
}

function mapOrderStatus(status: string | undefined): OrderStatus {
  if (!status) return 'PENDING'
  return (ORDER_STATUS_MAP[status] as OrderStatus) ?? 'PENDING'
}

export function transformOrder(raw: ManhattanWmsOrderResponse): Order {
  return {
    id: raw.orderId,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.orderNumber ?? undefined,
    customerId: raw.customerId ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    shipmentIds: raw.shipmentIds,
    currency: raw.currency ?? undefined,
    totalAmount: raw.totalAmount,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.requestedServiceCode ?? undefined,
    orderAt: toISODate(raw.orderAt),
    shippedAt: toISODate(raw.shippedAt),
    deliveredAt: toISODate(raw.deliveredAt),
    cancelledAt: toISODate(raw.cancelledAt),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
