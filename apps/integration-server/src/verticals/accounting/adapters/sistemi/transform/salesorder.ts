import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface SistemiSalesOrderLine {
  id: string
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  account_code: string
  [key: string]: unknown
}

export interface SistemiSalesOrder {
  id: string
  status: string
  currency: string
  gross_amount: number
  customer_id: string
  date: string
  lines?: SistemiSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'COMPLETED') return 'COMPLETED'
  if (status === 'CANCELLED') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: SistemiSalesOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
  }
}

export function transformSalesOrder(raw: SistemiSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
