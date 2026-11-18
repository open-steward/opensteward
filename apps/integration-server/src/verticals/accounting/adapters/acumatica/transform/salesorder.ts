import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface AcumaticaSalesOrderLine {
  LineNbr: number
  InventoryID: string
  Description: string
  OrderQty: number
  UnitPrice: number
  ExtPrice: number
  TaxAmt: number
  AccountID: string
  [key: string]: unknown
}

export interface AcumaticaSalesOrder {
  OrderNbr: string
  OrderType: string
  Status: string
  CuryOrderTotal: number
  CurrencyID: string
  CustomerID: string
  OrderDate: string
  RequestDate: string
  Details: AcumaticaSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'Completed':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Open':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AcumaticaSalesOrderLine): Lineitem {
  return {
    id: String(line.LineNbr),
    accountId: line.AccountID || undefined,
    itemId: line.InventoryID || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.OrderQty,
    totalAmount: line.ExtPrice,
    taxAmount: line.TaxAmt || undefined,
  }
}

export function transformSalesOrder(raw: AcumaticaSalesOrder): SalesOrder {
  return {
    id: raw.OrderNbr,
    status: mapStatus(raw.Status),
    contactId: raw.CustomerID || undefined,
    currency: raw.CurrencyID || undefined,
    totalAmount: raw.CuryOrderTotal,
    lineItems: (raw.Details ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
