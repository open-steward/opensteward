import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface GiobbySalesOrderLine {
  id: string
  description: string
  quantity: number
  unit_price: number
  amount_gross: number
  account_code: string
  [key: string]: unknown
}

export interface GiobbySalesOrder {
  id: string
  invoice_status: string
  currency: string
  amount_gross: number
  contact_id: string
  invoice_date: string
  items?: GiobbySalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'completed') return 'COMPLETED'
  if (status === 'void') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: GiobbySalesOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount_gross,
  }
}

export function transformSalesOrder(raw: GiobbySalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.invoice_status),
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_gross,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
