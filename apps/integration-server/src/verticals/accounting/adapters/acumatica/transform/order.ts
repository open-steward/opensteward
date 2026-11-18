import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface AcumaticaOrderLine {
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

export interface AcumaticaOrder {
  OrderNbr: string
  OrderType: string
  Status: string
  CuryOrderTotal: number
  CurrencyID: string
  CustomerID: string
  OrderDate: string
  Details: AcumaticaOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
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

function mapLineitem(line: AcumaticaOrderLine): Lineitem {
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

export function transformOrder(raw: AcumaticaOrder): Order {
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
