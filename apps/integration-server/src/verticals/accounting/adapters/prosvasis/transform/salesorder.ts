import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface ProsvasisSalesOrderLine {
  Id: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  TotalAmount: number
  VatAmount: number
  AccountCode: string
  [key: string]: unknown
}

export interface ProsvasisSalesOrder {
  id: string | number
  SeriesNumber: string
  Status: string
  Date: string
  TotalAmount: number
  VatAmount: number
  Currency: string
  CustomerId: string | number
  Lines: ProsvasisSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'Delivered':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Issued':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: ProsvasisSalesOrderLine): Lineitem {
  return {
    id: String(line.Id),
    accountId: line.AccountCode || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Quantity,
    totalAmount: line.TotalAmount,
    taxAmount: line.VatAmount || undefined,
  }
}

export function transformSalesOrder(raw: ProsvasisSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    contactId: raw.CustomerId ? String(raw.CustomerId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
