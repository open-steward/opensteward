import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface PEAccountingPurchaseOrderLine {
  id?: number | string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface PEAccountingPurchaseOrder {
  id: number | string
  contact_id?: number | string
  date?: string
  currency?: string
  total?: number
  status?: string
  lines?: PEAccountingPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): PurchaseOrderStatus {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'confirmed':
      return 'ACTIVE'
    case 'completed':
    case 'received':
      return 'COMPLETED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: PEAccountingPurchaseOrderLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
  }
}

export function transformPurchaseOrder(raw: PEAccountingPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
