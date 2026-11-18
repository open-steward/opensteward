import type { Order, OrderStatus } from '../../../schema/order'

export interface DaftraOrder {
  id: string
  OrderNo?: string
  Date?: string
  Status?: string
  TotalAmount?: number
  ClientId?: string
  Currency?: string
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status) {
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

export function transformOrder(raw: DaftraOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    type: 'SALES',
    contactId: raw.ClientId ? String(raw.ClientId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
