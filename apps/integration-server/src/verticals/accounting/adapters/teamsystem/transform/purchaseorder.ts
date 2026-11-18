import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface TeamSystemPurchaseOrderLine {
  id: string
  description: string
  quantity: number
  unitPrice: number
  totalAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface TeamSystemPurchaseOrder {
  id: string
  status: string
  currency: string
  totalAmount: number
  supplierId: string
  date: string
  lines?: TeamSystemPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'Received') return 'COMPLETED'
  if (status === 'Cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: TeamSystemPurchaseOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalAmount,
  }
}

export function transformPurchaseOrder(raw: TeamSystemPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
