import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface WintPurchaseOrderLine {
  id?: number | string
  text?: string
  qty?: number
  price?: number
  amount?: number
  account?: string | number
  [key: string]: unknown
}

export interface WintPurchaseOrder {
  id: number | string
  supplier_id?: number | string
  date?: string
  currency?: string
  gross?: number
  status?: string
  lines?: WintPurchaseOrderLine[]
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

function mapLineitem(line: WintPurchaseOrderLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    accountId: line.account != null ? String(line.account) : undefined,
    itemDescription: line.text || undefined,
    unitAmount: line.price,
    unitQuantity: line.qty,
    totalAmount: line.amount,
  }
}

export function transformPurchaseOrder(raw: WintPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.supplier_id != null ? String(raw.supplier_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
