import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface AccountsIQSalesOrderLine {
  lineId: string | number
  description: string
  quantity: number
  unitPrice: number
  lineAmount: number
  taxAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface AccountsIQSalesOrder {
  salesOrderId: string | number
  entityId: string | number
  status: string
  salesOrderNumber: string
  orderDate: string
  totalAmount: number
  currency: string
  contactId: string | number
  lines: AccountsIQSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'Completed':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Posted':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AccountsIQSalesOrderLine): Lineitem {
  return {
    id: String(line.lineId),
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.lineAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformSalesOrder(raw: AccountsIQSalesOrder): SalesOrder {
  return {
    id: String(raw.salesOrderId),
    status: mapStatus(raw.status),
    contactId: raw.contactId ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
