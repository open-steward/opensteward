import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface ZervantSalesOrderLine {
  id?: string
  description?: string
  quantity?: number
  unitPrice?: number
  total?: number
  accountCode?: string
  [key: string]: unknown
}

export interface ZervantSalesOrder {
  id: string
  contactId?: string
  date?: string
  currency?: string
  totalAmount?: number
  status?: string
  rows?: ZervantSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): SalesOrderStatus {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':
      return 'ACTIVE'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: ZervantSalesOrderLine): Lineitem {
  return {
    id: row.id || undefined,
    accountId: row.accountCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.total,
  }
}

export function transformSalesOrder(raw: ZervantSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.rows ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
