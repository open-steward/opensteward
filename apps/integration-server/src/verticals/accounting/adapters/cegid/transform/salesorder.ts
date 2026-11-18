import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface CegidSalesOrderRow {
  id: number
  description: string
  unitPrice: number
  quantity: number
  netAmount: number
  accountId: string
  [key: string]: unknown
}

export interface CegidSalesOrder {
  id: string
  customerId: string
  currency: string
  grossAmount: number
  documentDate: string
  documentStatus: string
  lines: CegidSalesOrderRow[]
  [key: string]: unknown
}

function mapStatus(documentStatus: string): SalesOrderStatus {
  if (documentStatus === 'Invoiced') return 'COMPLETED'
  if (documentStatus === 'Cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: CegidSalesOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.netAmount,
  }
}

export function transformSalesOrder(raw: CegidSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.documentStatus),
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
