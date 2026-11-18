import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface TeamSystemSalesOrderLine {
  id: string
  description: string
  quantity: number
  unitPrice: number
  totalAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface TeamSystemSalesOrder {
  id: string
  status: string
  currency: string
  totalAmount: number
  customerId: string
  date: string
  lines?: TeamSystemSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'Completed') return 'COMPLETED'
  if (status === 'Cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: TeamSystemSalesOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalAmount,
  }
}

export function transformSalesOrder(raw: TeamSystemSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
