import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface NetvisorPurchaseOrderLine {
  NetvisorKey: number
  ProductIdentifier: string
  ProductName: string
  Quantity: number
  UnitPrice: number
  LineSum: number
  AccountNumber: string
  [key: string]: unknown
}

export interface NetvisorPurchaseOrder {
  NetvisorKey: number
  OrderNumber: number
  VendorIdentifier: string
  Currency: string
  OrderDate: string
  Amount: number
  VatAmount: number
  Status: string
  OrderLines: NetvisorPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Received':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Open':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(row: NetvisorPurchaseOrderLine): Lineitem {
  return {
    id: String(row.NetvisorKey),
    itemId: row.ProductIdentifier || undefined,
    itemDescription: row.ProductName || undefined,
    unitQuantity: row.Quantity,
    unitAmount: row.UnitPrice,
    totalAmount: row.LineSum,
    accountId: row.AccountNumber || undefined,
  }
}

export function transformPurchaseOrder(raw: NetvisorPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.NetvisorKey),
    status: mapStatus(raw.Status),
    contactId: raw.VendorIdentifier || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    lineItems: (raw.OrderLines ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    VendorIdentifier: order.contactId,
    Currency: order.currency,
    OrderDate: toCalendarDate(order.postedAt),
    OrderLines: order.lineItems?.map((li) => ({
      ProductIdentifier: li.itemId,
      ProductName: li.itemDescription,
      UnitPrice: li.unitAmount,
      Quantity: li.unitQuantity,
      AccountNumber: li.accountId,
    })),
  }
}
