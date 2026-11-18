import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface InbooksOrderLine {
  id?: number | string
  description?: string
  quantity?: number
  rate?: number
  amount?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface InbooksOrder {
  id: number | string
  contact_id?: number | string
  date?: string
  currency?: string
  total_amount?: number
  status?: string
  type?: string
  lines?: InbooksOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'confirmed':
      return 'ACTIVE'
    case 'completed':
    case 'delivered':
      return 'COMPLETED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: InbooksOrderLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.rate,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformOrder(raw: InbooksOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: raw.type?.toUpperCase() === 'PURCHASE' ? 'PURCHASE' : 'SALES',
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
