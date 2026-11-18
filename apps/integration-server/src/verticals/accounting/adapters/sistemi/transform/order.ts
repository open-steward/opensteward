import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface SistemiOrderLine {
  id: string
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  account_code: string
  [key: string]: unknown
}

export interface SistemiOrder {
  id: string
  status: string
  currency: string
  gross_amount: number
  customer_id: string
  date: string
  lines?: SistemiOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  if (status === 'COMPLETED') return 'COMPLETED'
  if (status === 'CANCELLED') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: SistemiOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
  }
}

export function transformOrder(raw: SistemiOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
