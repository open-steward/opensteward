import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface ReckonPurchaseOrderLineItem {
  id: string
  description: string
  quantity: number
  unitAmount: number
  amount: number
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface ReckonPurchaseOrder {
  id: string
  orderNumber: string
  date: string
  dueDate: string
  totalAmount: number
  totalTax: number
  contactId: string
  contactName: string
  status: string
  lineItems: ReckonPurchaseOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status?.toUpperCase()) {
    case 'DRAFT':
      return 'DRAFT'
    case 'OPEN':
      return 'ACTIVE'
    case 'FULFILLED':
      return 'COMPLETED'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: ReckonPurchaseOrderLineItem): Lineitem {
  return {
    id: item.id || undefined,
    accountId: item.accountId || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unitAmount,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.taxAmount || undefined,
  }
}

export function transformPurchaseOrder(raw: ReckonPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contactId || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lineItems ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
