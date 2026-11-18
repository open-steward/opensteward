import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface GustoOrderLine {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  [key: string]: unknown
}

export interface GustoOrder {
  id: string | number
  status: string
  date: string
  company_id?: string | number
  total_amount: number
  currency?: string
  lines?: GustoOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'active':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: GustoOrderLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total_amount,
  }
}

export function transformOrder(raw: GustoOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.company_id ? String(raw.company_id) : undefined,
    currency: raw.currency || 'USD',
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
