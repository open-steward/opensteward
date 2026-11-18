import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface CuenticaOrderRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  total: number
  account: string
  [key: string]: unknown
}

export interface CuenticaOrder {
  id: string
  number: string
  date: string
  status: string
  contact_id: string
  currency: string
  total: number
  lines: CuenticaOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: CuenticaOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
  }
}

export function transformOrder(raw: CuenticaOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
