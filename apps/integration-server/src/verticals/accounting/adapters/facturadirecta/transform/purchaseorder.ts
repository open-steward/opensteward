import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface FacturadirectaPurchaseOrderRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  total: number
  account_id: string
  [key: string]: unknown
}

export interface FacturadirectaPurchaseOrder {
  id: string
  document_number: string
  document_date: string
  document_status: string
  supplier_id: string
  currency: string
  total_amount: number
  lines: FacturadirectaPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(document_status: string): PurchaseOrderStatus {
  switch (document_status) {
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: FacturadirectaPurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
  }
}

export function transformPurchaseOrder(raw: FacturadirectaPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.document_status),
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.document_date ? new Date(raw.document_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
