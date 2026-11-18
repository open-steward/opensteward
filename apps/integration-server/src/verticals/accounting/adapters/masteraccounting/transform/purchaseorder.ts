import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface MasteraccountingPurchaseOrderLine {
  id: string
  description?: string
  unitPrice: number
  quantity: number
  amount: number
  [key: string]: unknown
}

export interface MasteraccountingPurchaseOrder {
  id: string
  date: string
  status: string
  currency?: string
  totalSum?: number
  partnerId?: string
  lines?: MasteraccountingPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE'
    case 'COMPLETED':
      return 'COMPLETED'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MasteraccountingPurchaseOrderLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformPurchaseOrder(raw: MasteraccountingPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.partnerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalSum || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
