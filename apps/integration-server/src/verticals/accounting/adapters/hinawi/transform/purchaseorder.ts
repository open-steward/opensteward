import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface HinawiPurchaseOrderLineItem {
  Id: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  Total: number
  TaxAmount: number
  AccountId: string | number
  [key: string]: unknown
}

export interface HinawiPurchaseOrder {
  id: string | number
  OrderNo: string
  OrderDate: string
  Status: string
  SupplierId: string | number
  Currency: string
  Total: number
  LineItems: HinawiPurchaseOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
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

function mapLineitem(item: HinawiPurchaseOrderLineItem): Lineitem {
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

export function transformPurchaseOrder(raw: HinawiPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    contactId: raw.SupplierId ? String(raw.SupplierId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    lineItems: (raw.LineItems ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
