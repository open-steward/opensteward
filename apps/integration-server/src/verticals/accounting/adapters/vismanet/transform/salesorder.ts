import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface VismaNetSalesOrderLine {
  id?: string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  accountNumber?: string
  [key: string]: unknown
}

export interface VismaNetSalesOrder {
  id: string
  customerId?: string
  date?: string
  currency?: string
  grossAmount?: number
  status?: string
  lines?: VismaNetSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): SalesOrderStatus {
  switch (status) {
    case 'Confirmed':
      return 'ACTIVE'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: VismaNetSalesOrderLine): Lineitem {
  return {
    id: line.id || undefined,
    accountId: line.accountNumber || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformSalesOrder(raw: VismaNetSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
