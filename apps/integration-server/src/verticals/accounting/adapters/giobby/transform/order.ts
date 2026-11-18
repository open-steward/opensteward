import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface GiobbyOrderLine {
  id: string
  description: string
  quantity: number
  unit_price: number
  amount_gross: number
  account_code: string
  [key: string]: unknown
}

export interface GiobbyOrder {
  id: string
  invoice_status: string
  currency: string
  amount_gross: number
  contact_id: string
  invoice_date: string
  items?: GiobbyOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  if (status === 'completed') return 'COMPLETED'
  if (status === 'void') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: GiobbyOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount_gross,
  }
}

export function transformOrder(raw: GiobbyOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.invoice_status),
    type: 'SALES',
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_gross,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
