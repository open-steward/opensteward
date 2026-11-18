import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface QuipuOrderRow {
  id: number
  concept: string
  unitary_amount: number
  quantity: number
  total_amount: number
  account_id: string
  [key: string]: unknown
}

export interface QuipuOrder {
  id: string
  number: string
  issued_at: string
  status: string
  contact_id: string
  currency: string
  total_amount: number
  items: QuipuOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: QuipuOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.concept || undefined,
    unitAmount: row.unitary_amount,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
  }
}

export function transformOrder(raw: QuipuOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
