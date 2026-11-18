import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface ManagerioPurchaseOrderLine {
  Item: string
  Description: string
  Qty: number
  UnitPrice: number
  LineTotal: number
  Account: string
  [key: string]: unknown
}

export interface ManagerioPurchaseOrder {
  Key: string
  Reference: string
  Date: string
  Lines: ManagerioPurchaseOrderLine[]
  Total: number
  Contact: string
  Currency: string
  Status: string
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Draft': return 'DRAFT'
    case 'Active': return 'ACTIVE'
    case 'Completed': return 'COMPLETED'
    case 'Cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: ManagerioPurchaseOrderLine): Lineitem {
  return {
    itemId: line.Item || undefined,
    itemDescription: line.Description || undefined,
    unitQuantity: line.Qty,
    unitAmount: line.UnitPrice,
    totalAmount: line.LineTotal,
    accountId: line.Account || undefined,
  }
}

export function transformPurchaseOrder(raw: ManagerioPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.Key),
    status: mapStatus(raw.Status),
    contactId: raw.Contact || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(po: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    Date: toCalendarDate(po.postedAt),
    Contact: po.contactId,
    Currency: po.currency,
    Lines: po.lineItems?.map((li) => ({
      Item: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      Account: li.accountId,
    })),
  }
}
