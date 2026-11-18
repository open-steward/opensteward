import type { Order, OrderStatus } from '../../../schema/order'

export interface FatouaOrder {
  id: string
  order_no?: string
  date?: string
  status?: string
  total_amount?: number
  client_id?: string
  currency?: string
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status) {
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'pending':
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

export function transformOrder(raw: FatouaOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
