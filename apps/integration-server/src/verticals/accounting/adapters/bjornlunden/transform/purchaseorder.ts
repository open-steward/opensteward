import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface BlPurchaseOrderLine {
  Id: string
  ArticleNumber: string
  Description: string
  Quantity: number
  UnitPrice: number
  Amount: number
  AccountNumber: number
  [key: string]: unknown
}

export interface BlPurchaseOrder {
  Id: string
  OrderNumber: number
  SupplierId: string
  Currency: string
  OrderDate: string
  TotalAmount: number
  VatAmount: number
  Status: string
  Lines: BlPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Completed':
    case 'Received':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(row: BlPurchaseOrderLine): Lineitem {
  return {
    id: row.Id || undefined,
    itemId: row.ArticleNumber || undefined,
    itemDescription: row.Description || undefined,
    unitAmount: row.UnitPrice,
    unitQuantity: row.Quantity,
    totalAmount: row.Amount,
    accountId: row.AccountNumber ? String(row.AccountNumber) : undefined,
  }
}

export function transformPurchaseOrder(raw: BlPurchaseOrder): PurchaseOrder {
  return {
    id: raw.Id,
    status: mapStatus(raw.Status),
    contactId: raw.SupplierId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    SupplierId: order.contactId,
    Currency: order.currency,
    OrderDate: toCalendarDate(order.postedAt),
    Lines: order.lineItems?.map((li) => ({
      ArticleNumber: li.itemId,
      Description: li.itemDescription,
      UnitPrice: li.unitAmount,
      Quantity: li.unitQuantity,
      AccountNumber: li.accountId,
    })),
  }
}
