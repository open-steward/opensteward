import type { Order, OrderStatus } from '../../../schema/order'

export interface InvoiceqOrder {
  id: string
  order_number?: string
  date?: string
  status?: string
  total_amount?: number
  customer_id?: string
  currency_code?: string
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status) {
    case 'Completed':
    case 'completed':
      return 'COMPLETED'
    case 'Cancelled':
    case 'cancelled':
      return 'CANCELLED'
    case 'Draft':
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

export function transformOrder(raw: InvoiceqOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
