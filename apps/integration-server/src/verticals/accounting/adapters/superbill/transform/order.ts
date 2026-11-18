import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface SuperbillOrderLine {
  id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  account_code: string
  [key: string]: unknown
}

export interface SuperbillOrder {
  id: string
  status: string
  currency: string
  total_amount: number
  customer_id: string
  date: string
  lines?: SuperbillOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  if (status === 'completed') return 'COMPLETED'
  if (status === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: SuperbillOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
  }
}

export function transformOrder(raw: SuperbillOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
