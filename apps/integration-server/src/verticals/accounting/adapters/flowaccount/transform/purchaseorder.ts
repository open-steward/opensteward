import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface FlowAccountPurchaseOrderItem {
  id: string | number
  description: string
  quantity: number
  unitPrice: number
  amount: number
  vatAmount: number
  [key: string]: unknown
}

export interface FlowAccountPurchaseOrder {
  id: string | number
  documentSerial: string
  statusId: number
  issuedDate: string
  dueDate: string
  amountTotal: number
  currencyCode: string
  contactCode: string
  items: FlowAccountPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(statusId: number): PurchaseOrderStatus {
  switch (statusId) {
    case 3:
      return 'COMPLETED'
    case 4:
      return 'CANCELLED'
    case 2:
      return 'ACTIVE'
    case 1:
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FlowAccountPurchaseOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unitPrice,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.vatAmount || undefined,
  }
}

export function transformPurchaseOrder(raw: FlowAccountPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.statusId),
    contactId: raw.contactCode || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.amountTotal,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issuedDate ? new Date(raw.issuedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
