import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface UnimicroOrderLine {
  ID?: number
  ProductName?: string
  NumberOfItems?: number
  PriceExVat?: number
  SumTotalExVat?: number
  Account?: string
  [key: string]: unknown
}

export interface UnimicroOrder {
  ID?: number
  CustomerID?: number
  OrderDate?: string
  CurrencyCode?: string
  TaxInclusiveAmount?: number
  StatusCode?: number
  Type?: string
  Items?: UnimicroOrderLine[]
  [key: string]: unknown
}

function mapStatus(statusCode?: number): OrderStatus {
  switch (statusCode) {
    case 20:
      return 'ACTIVE'
    case 30:
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: UnimicroOrderLine): Lineitem {
  return {
    id: item.ID !== undefined ? String(item.ID) : undefined,
    accountId: item.Account || undefined,
    itemDescription: item.ProductName || undefined,
    unitAmount: item.PriceExVat,
    unitQuantity: item.NumberOfItems,
    totalAmount: item.SumTotalExVat,
  }
}

export function transformOrder(raw: UnimicroOrder): Order {
  return {
    id: String(raw.ID ?? ''),
    status: mapStatus(raw.StatusCode),
    type: raw.Type?.toUpperCase() === 'PURCHASE' ? 'PURCHASE' : 'SALES',
    contactId: raw.CustomerID !== undefined ? String(raw.CustomerID) : undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.TaxInclusiveAmount,
    lineItems: (raw.Items ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
