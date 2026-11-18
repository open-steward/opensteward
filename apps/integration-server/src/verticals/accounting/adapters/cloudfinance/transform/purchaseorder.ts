import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface CloudFinancePurchaseOrderLine {
  id: string
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  account_code: string
  [key: string]: unknown
}

export interface CloudFinancePurchaseOrder {
  id: string
  status: string
  currency: string
  total_amount: number
  supplier_id: string
  date: string
  lines?: CloudFinancePurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'received') return 'COMPLETED'
  if (status === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: CloudFinancePurchaseOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
  }
}

export function transformPurchaseOrder(raw: CloudFinancePurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
