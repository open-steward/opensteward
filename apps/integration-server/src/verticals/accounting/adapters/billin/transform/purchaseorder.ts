import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface BillinPurchaseOrderRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  total: number
  account: string
  [key: string]: unknown
}

export interface BillinPurchaseOrder {
  id: string
  order_number: string
  issue_date: string
  status: string
  supplier_id: string
  currency: string
  total: number
  lines: BillinPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: BillinPurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
  }
}

export function transformPurchaseOrder(raw: BillinPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
