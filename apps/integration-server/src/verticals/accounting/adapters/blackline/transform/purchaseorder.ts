import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface BlacklinePurchaseOrderLine {
  lineId: string
  description: string
  quantity: number
  unitAmount: number
  totalAmount: number
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface BlacklinePurchaseOrder {
  purchaseOrderId: string
  orderNumber: string
  status: string
  vendorId: string
  currency: string
  totalAmount: number
  orderDate: string
  createdBy: string
  createdAt: string
  modifiedBy: string
  modifiedAt: string
  lines: BlacklinePurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Approved':
      return 'ACTIVE'
    case 'Closed':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: BlacklinePurchaseOrderLine): Lineitem {
  return {
    id: line.lineId,
    accountId: line.accountId || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitAmount,
    unitQuantity: line.quantity,
    totalAmount: line.totalAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformPurchaseOrder(raw: BlacklinePurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.purchaseOrderId),
    status: mapStatus(raw.status),
    contactId: raw.vendorId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
