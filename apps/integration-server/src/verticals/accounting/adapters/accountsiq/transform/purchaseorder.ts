import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface AccountsIQPurchaseOrderLine {
  lineId: string | number
  description: string
  quantity: number
  unitPrice: number
  lineAmount: number
  taxAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface AccountsIQPurchaseOrder {
  purchaseOrderId: string | number
  entityId: string | number
  status: string
  purchaseOrderNumber: string
  orderDate: string
  totalAmount: number
  currency: string
  contactId: string | number
  lines: AccountsIQPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Completed':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Posted':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AccountsIQPurchaseOrderLine): Lineitem {
  return {
    id: String(line.lineId),
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.lineAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformPurchaseOrder(raw: AccountsIQPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.purchaseOrderId),
    status: mapStatus(raw.status),
    contactId: raw.contactId ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
