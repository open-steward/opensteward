import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface BluenextSalesOrderLine {
  id: string
  description: string
  quantity: number
  unitPrice: number
  totalAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface BluenextSalesOrder {
  id: string
  documentStatus: string
  currency: string
  totalAmount: number
  customerId: string
  documentDate: string
  lines?: BluenextSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'completed') return 'COMPLETED'
  if (status === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: BluenextSalesOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalAmount,
  }
}

export function transformSalesOrder(raw: BluenextSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.documentStatus),
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
