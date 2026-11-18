import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface ProsvasisPurchaseOrderLine {
  Id: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  TotalAmount: number
  VatAmount: number
  AccountCode: string
  [key: string]: unknown
}

export interface ProsvasisPurchaseOrder {
  id: string | number
  SeriesNumber: string
  Status: string
  Date: string
  TotalAmount: number
  VatAmount: number
  Currency: string
  SupplierId: string | number
  Lines: ProsvasisPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
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

function mapLineitem(line: ProsvasisPurchaseOrderLine): Lineitem {
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

export function transformPurchaseOrder(raw: ProsvasisPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    contactId: raw.SupplierId ? String(raw.SupplierId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
