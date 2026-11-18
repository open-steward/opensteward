import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface BlacklineSalesOrderLine {
  lineId: string
  description: string
  quantity: number
  unitAmount: number
  totalAmount: number
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface BlacklineSalesOrder {
  salesOrderId: string
  orderNumber: string
  status: string
  accountId: string
  currency: string
  totalAmount: number
  orderDate: string
  createdBy: string
  createdAt: string
  modifiedBy: string
  modifiedAt: string
  lines: BlacklineSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'Approved':
      return 'ACTIVE'
    case 'Closed':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: BlacklineSalesOrderLine): Lineitem {
  return {
    id: line.lineId,
    accountId: line.accountId || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitAmount,
    unitQuantity: line.quantity,
    totalAmount: line.totalAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformSalesOrder(raw: BlacklineSalesOrder): SalesOrder {
  return {
    id: String(raw.salesOrderId),
    status: mapStatus(raw.status),
    contactId: raw.accountId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
