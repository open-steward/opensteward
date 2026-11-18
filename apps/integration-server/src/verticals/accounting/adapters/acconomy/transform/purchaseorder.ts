import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface AcconomyPurchaseOrderLine {
  id?: number | string
  description?: string
  qty?: number
  unit_price?: number
  total?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface AcconomyPurchaseOrder {
  id: number | string
  contact_id?: number | string
  date?: string
  currency?: string
  total?: number
  state?: string
  lines?: AcconomyPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(state?: string): PurchaseOrderStatus {
  switch (state?.toLowerCase()) {
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

function mapLineitem(line: AcconomyPurchaseOrderLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.qty,
    totalAmount: line.total,
  }
}

export function transformPurchaseOrder(raw: AcconomyPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
