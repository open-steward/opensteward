import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface MazeedOneOrderLine {
  id: string | number
  description: string
  qty: number
  unit_price: number
  total: number
  vat_amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface MazeedOneOrder {
  id: string | number
  order_no: string
  order_date: string
  state: string
  client_id: string | number
  currency: string
  total: number
  lines: MazeedOneOrderLine[]
  [key: string]: unknown
}

function mapStatus(state: string): OrderStatus {
  switch (state) {
    case 'draft':
      return 'DRAFT'
    case 'active':
    case 'issued':
      return 'ACTIVE'
    case 'completed':
    case 'paid':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MazeedOneOrderLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.qty,
    totalAmount: line.total,
    taxAmount: line.vat_amount || undefined,
  }
}

export function transformOrder(raw: MazeedOneOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    type: 'SALES',
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.order_date ? new Date(raw.order_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
