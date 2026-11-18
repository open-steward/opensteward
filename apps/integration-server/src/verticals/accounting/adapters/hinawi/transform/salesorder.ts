import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface HinawiSalesOrderLineItem {
  Id: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  Total: number
  TaxAmount: number
  AccountId: string | number
  [key: string]: unknown
}

export interface HinawiSalesOrder {
  id: string | number
  OrderNo: string
  OrderDate: string
  Status: string
  CustomerId: string | number
  Currency: string
  Total: number
  LineItems: HinawiSalesOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'Draft':
      return 'DRAFT'
    case 'Active':
    case 'Open':
      return 'ACTIVE'
    case 'Completed':
    case 'Paid':
      return 'COMPLETED'
    case 'Cancelled':
    case 'Void':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: HinawiSalesOrderLineItem): Lineitem {
  return {
    id: String(item.Id),
    accountId: item.AccountId ? String(item.AccountId) : undefined,
    itemDescription: item.Description || undefined,
    unitAmount: item.UnitPrice,
    unitQuantity: item.Quantity,
    totalAmount: item.Total,
    taxAmount: item.TaxAmount || undefined,
  }
}

export function transformSalesOrder(raw: HinawiSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    contactId: raw.CustomerId ? String(raw.CustomerId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    lineItems: (raw.LineItems ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
