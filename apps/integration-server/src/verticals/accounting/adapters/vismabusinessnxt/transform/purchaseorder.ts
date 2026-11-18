import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface VismaBusinessNxtPurchaseOrderLine {
  id?: string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  accountNumber?: string
  [key: string]: unknown
}

export interface VismaBusinessNxtPurchaseOrder {
  id: string
  supplierId?: string
  date?: string
  currency?: string
  grossAmount?: number
  status?: string
  lines?: VismaBusinessNxtPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): PurchaseOrderStatus {
  switch (status) {
    case 'Open':
      return 'ACTIVE'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: VismaBusinessNxtPurchaseOrderLine): Lineitem {
  return {
    id: line.id || undefined,
    accountId: line.accountNumber || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformPurchaseOrder(raw: VismaBusinessNxtPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
