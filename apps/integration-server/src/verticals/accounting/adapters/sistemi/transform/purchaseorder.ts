import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface SistemiPurchaseOrderLine {
  id: string
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  account_code: string
  [key: string]: unknown
}

export interface SistemiPurchaseOrder {
  id: string
  status: string
  currency: string
  gross_amount: number
  supplier_id: string
  date: string
  lines?: SistemiPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'RECEIVED') return 'COMPLETED'
  if (status === 'CANCELLED') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: SistemiPurchaseOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
  }
}

export function transformPurchaseOrder(raw: SistemiPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
