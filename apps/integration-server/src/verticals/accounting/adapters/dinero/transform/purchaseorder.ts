import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface DineroPurchaseOrderLine {
  Guid: string
  ProductGuid: string
  Description: string
  Quantity: number
  AccountNumber: number
  BaseAmountValue: number
  TotalAmount: number
  [key: string]: unknown
}

export interface DineroPurchaseOrder {
  Guid: string
  Number: number
  ContactGuid: string
  Currency: string
  Date: string
  TotalInclVat: number
  TotalVat: number
  Status: string
  PurchaseOrderLines: DineroPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
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

function mapLineitem(line: DineroPurchaseOrderLine): Lineitem {
  return {
    id: line.Guid || undefined,
    accountId: line.AccountNumber ? String(line.AccountNumber) : undefined,
    itemId: line.ProductGuid || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.BaseAmountValue,
    unitQuantity: line.Quantity,
    totalAmount: line.TotalAmount,
  }
}

export function transformPurchaseOrder(raw: DineroPurchaseOrder): PurchaseOrder {
  return {
    id: raw.Guid,
    status: mapStatus(raw.Status),
    contactId: raw.ContactGuid || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalInclVat,
    lineItems: (raw.PurchaseOrderLines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(
  order: Partial<PurchaseOrder>,
): Record<string, unknown> {
  return {
    ContactGuid: order.contactId,
    Currency: order.currency,
    Date: toCalendarDate(order.postedAt),
    PurchaseOrderLines: order.lineItems?.map((li) => ({
      ProductGuid: li.itemId,
      Description: li.itemDescription,
      BaseAmountValue: li.unitAmount,
      Quantity: li.unitQuantity,
      AccountNumber: li.accountId,
    })),
  }
}
