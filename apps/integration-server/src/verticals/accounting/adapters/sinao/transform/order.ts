import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface SinaoOrderRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  amount_excl_tax: number
  account_id: string
  [key: string]: unknown
}

export interface SinaoOrder {
  id: string
  contact_id: string
  currency: string
  total_amount: number
  date: string
  status: string
  lines: SinaoOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  if (status === 'invoiced') return 'COMPLETED'
  if (status === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: SinaoOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount_excl_tax,
  }
}

export function transformOrder(raw: SinaoOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
