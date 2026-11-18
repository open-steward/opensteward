import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface QuipuPurchaseOrderRow {
  id: number
  concept: string
  unitary_amount: number
  quantity: number
  total_amount: number
  account_id: string
  [key: string]: unknown
}

export interface QuipuPurchaseOrder {
  id: string
  number: string
  issued_at: string
  status: string
  contact_id: string
  currency: string
  total_amount: number
  items: QuipuPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: QuipuPurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.concept || undefined,
    unitAmount: row.unitary_amount,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
  }
}

export function transformPurchaseOrder(raw: QuipuPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
