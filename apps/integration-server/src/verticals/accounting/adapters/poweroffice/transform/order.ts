import type { Order, OrderStatus } from '../../../schema/order'

export interface PowerOfficeOrder {
  id: number
  customerId: number
  orderDate: string
  currencyCode: string
  grossAmount: number
  status: number
  orderNo: string
  [key: string]: unknown
}

function mapStatus(status: number): OrderStatus {
  if (status === 5) return 'COMPLETED'
  if (status === 9) return 'CANCELLED'
  return 'ACTIVE'
}

export function transformOrder(raw: PowerOfficeOrder): Order {
  return {
    id: String(raw.id),
    type: 'SALES',
    status: mapStatus(raw.status),
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.grossAmount,
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
