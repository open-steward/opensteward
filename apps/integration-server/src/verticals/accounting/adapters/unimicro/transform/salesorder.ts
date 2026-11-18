import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface UnimicroSalesOrderLine {
  ID?: number
  ProductName?: string
  NumberOfItems?: number
  PriceExVat?: number
  SumTotalExVat?: number
  Account?: string
  [key: string]: unknown
}

export interface UnimicroSalesOrder {
  ID?: number
  CustomerID?: number
  OrderDate?: string
  CurrencyCode?: string
  TaxInclusiveAmount?: number
  StatusCode?: number
  Items?: UnimicroSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(statusCode?: number): SalesOrderStatus {
  switch (statusCode) {
    case 20:
      return 'ACTIVE'
    case 30:
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: UnimicroSalesOrderLine): Lineitem {
  return {
    id: item.ID !== undefined ? String(item.ID) : undefined,
    accountId: item.Account || undefined,
    itemDescription: item.ProductName || undefined,
    unitAmount: item.PriceExVat,
    unitQuantity: item.NumberOfItems,
    totalAmount: item.SumTotalExVat,
  }
}

export function transformSalesOrder(raw: UnimicroSalesOrder): SalesOrder {
  return {
    id: String(raw.ID ?? ''),
    status: mapStatus(raw.StatusCode),
    contactId: raw.CustomerID !== undefined ? String(raw.CustomerID) : undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.TaxInclusiveAmount,
    lineItems: (raw.Items ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
