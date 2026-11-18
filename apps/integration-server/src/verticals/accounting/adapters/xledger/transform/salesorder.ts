import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface XledgerSalesOrderLine {
  id?: string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  accountCode?: string
  [key: string]: unknown
}

export interface XledgerSalesOrder {
  id: string
  entityCode?: string
  transactionDate?: string
  currency?: string
  grossAmount?: number
  status?: number
  lines?: XledgerSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: number): SalesOrderStatus {
  switch (status) {
    case 10:
      return 'DRAFT'
    case 20:
      return 'ACTIVE'
    case 40:
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: XledgerSalesOrderLine): Lineitem {
  return {
    id: line.id || undefined,
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformSalesOrder(raw: XledgerSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.entityCode || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
