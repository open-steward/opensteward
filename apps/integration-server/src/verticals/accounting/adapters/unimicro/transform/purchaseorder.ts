import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface UnimicroPurchaseOrderLine {
  ID?: number
  ProductName?: string
  NumberOfItems?: number
  PriceExVat?: number
  SumTotalExVat?: number
  Account?: string
  [key: string]: unknown
}

export interface UnimicroPurchaseOrder {
  ID?: number
  SupplierID?: number
  OrderDate?: string
  CurrencyCode?: string
  TaxInclusiveAmount?: number
  StatusCode?: number
  Items?: UnimicroPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(statusCode?: number): PurchaseOrderStatus {
  switch (statusCode) {
    case 20:
      return 'ACTIVE'
    case 30:
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: UnimicroPurchaseOrderLine): Lineitem {
  return {
    id: item.ID !== undefined ? String(item.ID) : undefined,
    accountId: item.Account || undefined,
    itemDescription: item.ProductName || undefined,
    unitAmount: item.PriceExVat,
    unitQuantity: item.NumberOfItems,
    totalAmount: item.SumTotalExVat,
  }
}

export function transformPurchaseOrder(raw: UnimicroPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.ID ?? ''),
    status: mapStatus(raw.StatusCode),
    contactId: raw.SupplierID !== undefined ? String(raw.SupplierID) : undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.TaxInclusiveAmount,
    lineItems: (raw.Items ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
