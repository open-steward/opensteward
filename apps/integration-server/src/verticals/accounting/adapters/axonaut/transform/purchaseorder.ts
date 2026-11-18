import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface AxonautPurchaseOrderRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  pretax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface AxonautPurchaseOrder {
  id: string
  number: string
  supplier_id: string
  currency: string
  creation_date: string
  total_amount: number
  status: string
  lines: AxonautPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: AxonautPurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.pretax_amount,
  }
}

export function transformPurchaseOrder(raw: AxonautPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.creation_date ? new Date(raw.creation_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
