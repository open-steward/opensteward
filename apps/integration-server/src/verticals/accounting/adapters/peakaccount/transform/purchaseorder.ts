import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface PeakAccountPurchaseOrderItem {
  id: string | number
  description: string
  quantity: number
  unitPrice: number
  amount: number
  vatAmount: number
  [key: string]: unknown
}

export interface PeakAccountPurchaseOrder {
  id: string | number
  documentNo: string
  status: string
  issueDate: string
  dueDate: string
  totalAmount: number
  currency: string
  contactId: string | number
  items: PeakAccountPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'paid':
    case 'approved':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'pending':
      return 'ACTIVE'
    case 'draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: PeakAccountPurchaseOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unitPrice,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.vatAmount || undefined,
  }
}

export function transformPurchaseOrder(raw: PeakAccountPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.contactId ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
