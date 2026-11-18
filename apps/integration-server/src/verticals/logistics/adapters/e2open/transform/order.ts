import type { Order } from '../../../schema/order'
import { toISODate, toAddress } from '../../shared/transform'

export interface E2openOrderRaw {
  orderId?: string
  orderNumber?: string
  status?: string
  createdDate?: string
  updatedDate?: string
  origin?: Record<string, unknown>
  destination?: Record<string, unknown>
  [key: string]: unknown
}

const ORDER_STATUS_MAP: Record<string, Order['status']> = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  ON_HOLD: 'ON_HOLD',
  AWAITING_SHIPMENT: 'AWAITING_SHIPMENT',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
}

function toOrderStatus(code: string | undefined): Order['status'] {
  if (!code) return 'UNKNOWN'
  return ORDER_STATUS_MAP[code.toUpperCase()] ?? 'UNKNOWN'
}

export function transformOrder(raw: E2openOrderRaw): Order {
  return {
    id: raw.orderId,
    orderNumber: raw.orderNumber ?? undefined,
    status: toOrderStatus(raw.status),
    originAddress: toAddress(raw.origin ?? null),
    destinationAddress: toAddress(raw.destination ?? null),
    createdAt: toISODate(raw.createdDate),
    updatedAt: toISODate(raw.updatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
