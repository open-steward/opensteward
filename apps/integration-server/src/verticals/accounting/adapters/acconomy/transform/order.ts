import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface AcconomyOrderLine {
  id?: number | string
  description?: string
  qty?: number
  unit_price?: number
  total?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface AcconomyOrder {
  id: number | string
  contact_id?: number | string
  date?: string
  currency?: string
  total?: number
  state?: string
  type?: string
  lines?: AcconomyOrderLine[]
  [key: string]: unknown
}

function mapStatus(state?: string): OrderStatus {
  switch (state?.toLowerCase()) {
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

function mapLineitem(line: AcconomyOrderLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.qty,
    totalAmount: line.total,
  }
}

export function transformOrder(raw: AcconomyOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    type: raw.type?.toUpperCase() === 'PURCHASE' ? 'PURCHASE' : 'SALES',
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
