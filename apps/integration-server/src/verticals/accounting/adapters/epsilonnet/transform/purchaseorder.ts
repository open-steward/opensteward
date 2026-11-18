import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface EpsilonNetPurchaseOrderLine {
  id: string | number
  description: string
  quantity: number
  unitPrice: number
  totalAmount: number
  vatAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface EpsilonNetPurchaseOrder {
  id: string | number
  orderNumber: string
  status: string
  issueDate: string
  totalGrossValue: number
  totalVatAmount: number
  currency: string
  counterpart: {
    vatNumber: string
    [key: string]: unknown
  }
  lines: EpsilonNetPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Delivered':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Submitted':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: EpsilonNetPurchaseOrderLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.totalAmount,
    taxAmount: line.vatAmount || undefined,
  }
}

export function transformPurchaseOrder(raw: EpsilonNetPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.counterpart?.vatNumber || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalGrossValue,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
